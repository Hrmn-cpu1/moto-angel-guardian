// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { dispatchDueSosNotifications } from "./sos-dispatch.server";
vi.mock("./sos-dispatch.server", () => ({ dispatchDueSosNotifications: vi.fn() }));
import {
  createProtectionSession,
  cancelProtectionRequest,
  handleNativeSos,
  hashProtectionToken,
  revokeProtectionSession,
} from "./native-protection.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const requestId = "9bb18033-a348-4d20-996e-0b9aa7c64999";
const token = "a".repeat(43);
const input = { requestId, lat: -23.5, lng: -46.6, accuracy: 10, fixAgeMs: 1000, source: "manual" };
const row = {
  sos_event_id: "event",
  request_id: requestId,
  status: "active",
  triggered_at: "2026-09-08T00:00:00Z",
  reused: false,
  queued: 2,
};
function request(body: unknown = input, bearer = token, url = "https://qa.invalid/api/native/sos") {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
  });
}
function database(data: unknown = [row], error: null | { code: string } = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, db: { rpc } as unknown as NonNullable<Parameters<typeof handleNativeSos>[1]> };
}

test("session stores only 256-bit token hash and returns plaintext once", async () => {
  const { db, rpc } = database([{ session_id: "session", expires_at: "later" }]);
  const result = await createProtectionSession(
    "owner",
    { deviceSessionId: requestId, tripStartedAt: Date.now() },
    db,
  );
  expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result).toMatchObject({ sessionId: "session", expiresAt: "later" });
  expect(rpc).toHaveBeenCalledWith(
    "native_protection_create",
    expect.objectContaining({ _user_id: "owner", _token_hash: hashProtectionToken(result.token) }),
  );
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.token);
});
test("expired/future trip cannot create credential and revoke passes authenticated owner", async () => {
  const { db, rpc } = database(true);
  for (const tripStartedAt of [0, Date.now() + 61_000, Date.now() - 12 * 60 * 60_000]) {
    await expect(
      createProtectionSession("owner", { deviceSessionId: requestId, tripStartedAt }, db),
    ).rejects.toThrow();
  }
  expect(rpc).not.toHaveBeenCalled();
  expect(await revokeProtectionSession("owner", "session", db)).toEqual({ revoked: true });
  expect(rpc).toHaveBeenCalledWith("native_protection_revoke", {
    _user_id: "owner",
    _session_id: "session",
  });
});
test.each([
  { ...input, lat: 0, lng: 0 },
  { ...input, accuracy: 501 },
  { ...input, accuracy: null },
  { ...input, fixAgeMs: 60_001 },
  { ...input, source: "other" },
  { ...input, userId: "other-owner" },
])("invalid or over-scoped payload never reaches database: %j", async (body) => {
  const { db, rpc } = database();
  expect((await handleNativeSos(request(body), db)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test("large chunked body, malformed bearer and insecure transport are rejected", async () => {
  const { db, rpc } = database();
  expect((await handleNativeSos(request({ note: "x".repeat(5000) }), db)).status).toBe(400);
  expect((await handleNativeSos(request(input, "bad"), db)).status).toBe(401);
  expect((await handleNativeSos(request(input, token, "http://qa.invalid"), db)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([
  ["42501", 401],
  ["22023", 400],
  ["XX000", 503],
] as const)("database %s is sanitized as HTTP %s", async (code, status) => {
  const { db } = database(null, { code });
  const response = await handleNativeSos(request(), db);
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain(code);
});
test("native trigger reuses durable pipeline and returns no profile or bearer", async () => {
  vi.stubEnv("SOS_DELIVERY_ENABLED", "false");
  const { db, rpc } = database([{ ...row, reused: true }]);
  const response = await handleNativeSos(request(), db);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    sosEventId: "event",
    requestId,
    status: "active",
    triggeredAt: row.triggered_at,
    reused: true,
    queued: 2,
    autoDispatch: false,
  });
  expect(rpc).toHaveBeenCalledWith(
    "native_protection_sos_open",
    expect.objectContaining({ _token_hash: hashProtectionToken(token), _request_id: requestId }),
  );
  expect(dispatchDueSosNotifications).not.toHaveBeenCalled();
});
test("automatic configuration does not couple durable registration to provider work", async () => {
  for (const name of [
    "SOS_DELIVERY_ENABLED",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_SOS_TEMPLATE_NAME",
    "WHATSAPP_SOS_TEMPLATE_LANGUAGE",
    "WHATSAPP_GRAPH_VERSION",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  ])
    vi.stubEnv(name, name === "SOS_DELIVERY_ENABLED" ? "true" : "qa");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v24.0");
  const { db } = database();
  expect((await handleNativeSos(request(), db)).status).toBe(200);
  expect(dispatchDueSosNotifications).not.toHaveBeenCalled();
});

test.each(["cancelled", "resolved"])(
  "terminal retry returns its closed event without dispatch: %s",
  async (status) => {
    const { db } = database([{ ...row, status, reused: true }]);
    const response = await handleNativeSos(request(), db);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requestId, status, reused: true });
    expect(dispatchDueSosNotifications).not.toHaveBeenCalled();
  },
);

test.each(["cancelled", "resolved", "absent"])(
  "pending cancellation accepts only durable terminal proof: %s",
  async (status) => {
    const { db, rpc } = database([
      { cancelled: true, sos_event_id: status === "absent" ? null : "event", status },
    ]);
    expect(await cancelProtectionRequest("owner", { sessionId: "session", requestId }, db)).toEqual(
      { cancelled: true, sosEventId: status === "absent" ? null : "event", status },
    );
    expect(rpc).toHaveBeenCalledWith("native_protection_cancel_pending", {
      _user_id: "owner",
      _session_id: "session",
      _request_id: requestId,
    });
  },
);
test("uncertain, foreign or rotated cancellation never lets the device erase its request", async () => {
  for (const result of [
    database(null, { code: "42501" }),
    database([]),
    database([{ cancelled: false, status: "cancelled" }]),
    database([{ cancelled: true, status: "active" }]),
  ]) {
    await expect(
      cancelProtectionRequest("owner", { sessionId: "session", requestId }, result.db),
    ).rejects.toThrow("não confirmou");
  }
});
