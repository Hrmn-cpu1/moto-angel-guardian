// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createHmac } from "node:crypto";
import { isWhatsAppConfigured, sendSosTemplate } from "./sos.server";
import { handleWhatsAppWebhook, verifyMetaSignature } from "./sos-webhook.server";
import { dispatchDueSosNotifications } from "./sos-dispatch.server";
import type { sosDatabase } from "./sos-database.server";

const details = {
  name: "QA",
  phone: "11999990000",
  lat: -23.5,
  lng: -46.6,
  when: new Date("2026-09-08T12:00:00Z"),
};
beforeEach(() => {
  vi.stubEnv("SOS_DELIVERY_ENABLED", "true");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234");
  vi.stubEnv("WHATSAPP_SOS_TEMPLATE_NAME", "sos_alerta");
  vi.stubEnv("WHATSAPP_SOS_TEMPLATE_LANGUAGE", "pt_BR");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v24.0");
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-secret");
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "test-verify");
});
afterEach(() => vi.unstubAllEnvs());

function mockDb(rows: unknown[] = []) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "claim_due_sos_notifications" ? rows : true,
    error: null,
  }));
  const maybeSingle = vi.fn(async () => ({ data: { status: "active" }, error: null }));
  const db = { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
  return { db: db as unknown as typeof sosDatabase, rpc, maybeSingle };
}
function webhook(payload: unknown, valid = true) {
  const body = JSON.stringify(payload);
  return new Request("https://qa.invalid/api/public/whatsapp-webhook", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", valid ? "test-secret" : "wrong")
        .update(body)
        .digest("hex")}`,
    },
  });
}
const receipt = (status = "delivered", phone = "1234") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: phone },
            statuses: [{ id: "wamid.qa", status, timestamp: "1788868800" }],
          },
        },
      ],
    },
  ],
});
const claimed = {
  id: "id1",
  sos_event_id: "event1",
  recipient_phone: "5511999990000",
  attempts: 1,
  rider_name: "QA",
  rider_phone: "",
  latitude: -23,
  longitude: -46,
  triggered_at: details.when.toISOString(),
};

test("disabled or missing template sends no request and reserves no row", async () => {
  vi.stubEnv("SOS_DELIVERY_ENABLED", "false");
  const fetcher = vi.fn();
  expect(isWhatsAppConfigured()).toBe(false);
  expect((await sendSosTemplate("11999990000", details, fetcher)).ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  const { db, rpc } = mockDb([claimed]);
  expect((await dispatchDueSosNotifications({}, db)).disabled).toBe(true);
  expect(rpc).not.toHaveBeenCalled();
  vi.stubEnv("SOS_DELIVERY_ENABLED", "true");
  vi.stubEnv("WHATSAPP_SOS_TEMPLATE_NAME", "");
  expect(isWhatsAppConfigured()).toBe(false);
});
test("send uses four approved-template parameters and timeout, never free-form", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ messages: [{ id: "wamid.qa" }] }),
  );
  expect(await sendSosTemplate("11999990000", details, fetcher)).toMatchObject({
    ok: true,
    providerMessageId: "wamid.qa",
  });
  const init = fetcher.mock.calls[0]?.[1] as RequestInit;
  const payload = JSON.parse(String(init.body));
  expect(payload.type).toBe("template");
  expect(payload.template.components[0].parameters).toHaveLength(4);
  expect(payload).not.toHaveProperty("text");
  expect(init.signal).toBeInstanceOf(AbortSignal);
});
test.each([500, 502, 503])("HTTP %s is uncertain and cannot be retried blindly", async (status) => {
  expect(
    await sendSosTemplate("11999990000", details, async () => new Response("error", { status })),
  ).toMatchObject({ ok: false, uncertain: true, retryable: false });
});
test("network failure and accepted response without id are uncertain", async () => {
  expect(
    await sendSosTemplate("11999990000", details, async () => {
      throw new Error("timeout");
    }),
  ).toMatchObject({ ok: false, uncertain: true });
  expect(
    await sendSosTemplate("11999990000", details, async () => Response.json({})),
  ).toMatchObject({ ok: false, uncertain: true });
});
test("only an explicit rate rejection is retryable", async () => {
  expect(
    await sendSosTemplate(
      "11999990000",
      details,
      async () => new Response("rate", { status: 429 }),
    ),
  ).toMatchObject({ ok: false, uncertain: false, retryable: true });
  expect(
    await sendSosTemplate(
      "11999990000",
      details,
      async () => new Response("invalid", { status: 400 }),
    ),
  ).toMatchObject({ ok: false, uncertain: false, retryable: false });
});
test("worker runs independently of client and settles uncertain sends explicitly", async () => {
  const { db, rpc } = mockDb([claimed]);
  const send = vi.fn(async () => ({
    ok: false as const,
    error: "timeout",
    uncertain: true,
    httpStatus: 0,
    latencyMs: 1,
  }));
  const result = await dispatchDueSosNotifications({}, db, send);
  expect(result).toMatchObject({ claimed: 1, unknown: 1, accepted: 0 });
  expect(rpc).toHaveBeenLastCalledWith(
    "settle_sos_dispatch",
    expect.objectContaining({ _outcome: "unknown", _retryable: false }),
  );
});
test("cancellation after claim prevents external send", async () => {
  const { db, maybeSingle } = mockDb([claimed]);
  maybeSingle.mockResolvedValue({ data: { status: "cancelled" }, error: null });
  const send = vi.fn();
  expect((await dispatchDueSosNotifications({}, db, send)).skipped).toBe(1);
  expect(send).not.toHaveBeenCalled();
});
test("lost settlement is an explicit error instead of a successful send count", async () => {
  const { db, rpc } = mockDb([claimed]);
  rpc.mockImplementation(async (name) => ({
    data: name === "claim_due_sos_notifications" ? [claimed] : false,
    error: null,
  }));
  const send = vi.fn(async () => ({
    ok: true as const,
    providerMessageId: "wamid.qa",
    httpStatus: 200,
    latencyMs: 1,
  }));
  await expect(dispatchDueSosNotifications({}, db, send)).rejects.toThrow("reconciliação");
});
test("invalid signature and wrong phone never write receipt", async () => {
  const { db, rpc } = mockDb();
  expect((await handleWhatsAppWebhook(webhook(receipt(), false), db)).status).toBe(401);
  expect((await handleWhatsAppWebhook(webhook(receipt("delivered", "999")), db)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(verifyMetaSignature("x", "sha256=short", "test-secret")).toBe(false);
});
test("authenticated webhook persists receipt; DB failure requests redelivery", async () => {
  const { db, rpc } = mockDb();
  expect((await handleWhatsAppWebhook(webhook(receipt()), db)).status).toBe(204);
  expect(rpc).toHaveBeenCalledWith(
    "receive_sos_delivery",
    expect.objectContaining({ _provider_message_id: "wamid.qa", _status: "delivered" }),
  );
  rpc.mockResolvedValue({ data: false, error: null });
  expect((await handleWhatsAppWebhook(webhook(receipt()), db)).status).toBe(503);
});
test("subscription challenge requires verify token", async () => {
  const { db } = mockDb();
  const valid = new Request(
    "https://qa.invalid/?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123",
  );
  expect(await (await handleWhatsAppWebhook(valid, db)).text()).toBe("123");
  expect(
    (
      await handleWhatsAppWebhook(
        new Request("https://qa.invalid/?hub.mode=subscribe&hub.challenge=123"),
        db,
      )
    ).status,
  ).toBe(403);
});
