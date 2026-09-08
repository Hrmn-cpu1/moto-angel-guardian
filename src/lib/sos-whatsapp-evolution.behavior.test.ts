// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isWhatsAppConfigured, sendSosTemplate } from "./sos.server";
import { sendSosEvolution } from "./sos-whatsapp-evolution.server";
import { sendSosWhatsApp } from "./sos-whatsapp.server";
import { dispatchDueSosNotifications } from "./sos-dispatch.server";
import type { sosDatabase } from "./sos-database.server";

const activated = "2026-09-08T20:00:00Z";
const data = {
  name: "Piloto QA",
  phone: "11999990000",
  lat: -23.5,
  lng: -46.6,
  when: new Date("2026-09-08T20:00:01Z"),
};
beforeEach(() => {
  vi.stubEnv("SOS_DELIVERY_ENABLED", "true");
  vi.stubEnv("SOS_DELIVERY_PROVIDER", "evolution");
  vi.stubEnv("SOS_DELIVERY_NOT_BEFORE", activated);
  vi.stubEnv("EVOLUTION_API_URL", "https://evolution.example.com/");
  vi.stubEnv("EVOLUTION_INSTANCE", "qa-instance");
  vi.stubEnv("EVOLUTION_API_KEY", "fixture-secret-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function fetcherWith(response: Response | Error) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST")
      return Response.json({ instance: { instanceName: "qa-instance", state: "open" } });
    if (response instanceof Error) throw response;
    return response;
  });
}

test("v2 sendText uses server apikey, flat text and namespaced acceptance id", async () => {
  const fetcher = fetcherWith(
    Response.json({ key: { id: "QA-message" }, status: "PENDING" }, { status: 201 }),
  );
  const result = await sendSosWhatsApp("(11) 99999-0000", data, fetcher);
  expect(result).toMatchObject({
    ok: true,
    providerMessageId: "evolution:qa-instance:QA-message",
    httpStatus: 201,
  });
  expect(result).not.toHaveProperty("delivered");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [url, init] = fetcher.mock.calls[1];
  expect(url).toBe("https://evolution.example.com/message/sendText/qa-instance");
  expect(init).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { apikey: "fixture-secret-not-real" },
  });
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  const payload = JSON.parse(String(init?.body));
  expect(payload.number).toBe("5511999990000");
  expect(payload.text).toContain("Piloto QA acionou um SOS");
  expect(payload.text).toContain("https://maps.google.com/?q=-23.5,-46.6");
  expect(payload.linkPreview).toBe(false);
  expect(payload).not.toHaveProperty("textMessage");
  expect(JSON.stringify(payload)).not.toContain("fixture-secret");
});

test.each([
  ["SOS_DELIVERY_ENABLED", "false"],
  ["SOS_DELIVERY_PROVIDER", "typo"],
  ["SOS_DELIVERY_NOT_BEFORE", ""],
  ["SOS_DELIVERY_NOT_BEFORE", "yesterday"],
  ["EVOLUTION_API_KEY", ""],
  ["EVOLUTION_INSTANCE", "../other"],
  ["EVOLUTION_API_URL", "http://evolution.example.com"],
  ["EVOLUTION_API_URL", "https://secret@example.com"],
  ["EVOLUTION_API_URL", "https://evolution.example.com?key=bad"],
])("invalid %s disables auto delivery and makes no provider request", async (name, value) => {
  vi.stubEnv(name, value);
  const fetcher = vi.fn();
  expect(isWhatsAppConfigured()).toBe(false);
  expect((await sendSosEvolution("11999990000", data, fetcher)).ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

test("an old SOS cannot be sent directly even immediately after activation", async () => {
  const fetcher = vi.fn();
  const result = await sendSosEvolution(
    "11999990000",
    { ...data, when: new Date("2026-09-08T19:59:59.999Z") },
    fetcher,
  );
  expect(result).toMatchObject({ ok: false, retryable: false });
  expect(fetcher).not.toHaveBeenCalled();
});

test("disconnected, unauthorized or missing instance never posts a message", async () => {
  for (const response of [
    Response.json({ instance: { instanceName: "qa-instance", state: "close" } }),
    new Response("body-must-not-leak-fixture-secret", { status: 401 }),
    new Response("missing", { status: 404 }),
  ]) {
    const fetcher = vi.fn<typeof fetch>(async () => response);
    const result = await sendSosEvolution("11999990000", data, fetcher);
    expect(result).toMatchObject({ ok: false, uncertain: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("body-must-not-leak");
  }
});

test("unreachable read-only preflight may retry, without calling sendText", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    throw new Error("network");
  });
  expect(await sendSosEvolution("11999990000", data, fetcher)).toMatchObject({
    ok: false,
    uncertain: false,
    retryable: true,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

test.each([408, 500, 502, 503])(
  "sendText HTTP %s is uncertain and never auto retried",
  async (status) => {
    const result = await sendSosEvolution(
      "11999990000",
      data,
      fetcherWith(new Response("error", { status })),
    );
    expect(result).toMatchObject({ ok: false, uncertain: true, retryable: false });
  },
);

test("lost send response and missing message id remain unknown", async () => {
  for (const response of [new Error("network secret"), Response.json({ status: "PENDING" })]) {
    expect(await sendSosEvolution("11999990000", data, fetcherWith(response))).toMatchObject({
      ok: false,
      uncertain: true,
      retryable: false,
    });
  }
});

test("explicit send rate rejection can retry but authentication failure cannot", async () => {
  expect(
    await sendSosEvolution("11999990000", data, fetcherWith(new Response("rate", { status: 429 }))),
  ).toMatchObject({ ok: false, uncertain: false, retryable: true });
  expect(
    await sendSosEvolution("11999990000", data, fetcherWith(new Response("auth", { status: 401 }))),
  ).toMatchObject({ ok: false, uncertain: false, retryable: false });
});

test("Evolution selection never falls through to the Meta template API", async () => {
  const fetcher = vi.fn();
  expect((await sendSosTemplate("11999990000", data, fetcher)).ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

function database(rows: unknown[], readState?: (table: string) => unknown) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "claim_due_sos_notifications" ? rows : true,
    error: null,
  }));
  const update = vi.fn();
  const chain = {
    eq: () => chain,
    select: () => chain,
    maybeSingle: async () => ({ data: { id: "new", status: "active" }, error: null }),
  };
  update.mockReturnValue(chain);
  const from = vi.fn((table: string) => {
    const reader = {
      eq: () => reader,
      maybeSingle: async () =>
        readState?.(table) ?? {
          data: { id: "new", status: "active", claimed_at: new Date().toISOString() },
          error: null,
        },
    };
    return { select: () => reader, update };
  });
  return { rpc, update, db: { rpc, from } as unknown as typeof sosDatabase };
}
const notification = {
  id: "notification",
  sos_event_id: "event",
  recipient_phone: "5511999990000",
  attempts: 1,
  rider_name: "QA",
  rider_phone: "",
  latitude: -23.5,
  longitude: -46.6,
  triggered_at: data.when.toISOString(),
};

test("worker excludes pre-activation queued SOS and tags new sends as Evolution", async () => {
  const { db, rpc, update } = database([
    { ...notification, id: "old", triggered_at: "2026-09-08T19:59:59.999Z" },
    notification,
  ]);
  const send = vi.fn(async () => ({
    ok: true as const,
    providerMessageId: "evolution:qa-instance:qa",
    httpStatus: 201,
    latencyMs: 1,
  }));
  const result = await dispatchDueSosNotifications({}, db, send);
  expect(result).toMatchObject({ claimed: 2, skipped: 1, accepted: 1 });
  expect(send).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledWith({ provider: "evolution" });
  expect(rpc).toHaveBeenCalledWith(
    "settle_sos_dispatch",
    expect.objectContaining({ _id: "old", _outcome: "failed", _retryable: false }),
  );
  expect(rpc).toHaveBeenCalledWith(
    "settle_sos_dispatch",
    expect.objectContaining({ _id: "notification", _outcome: "sent" }),
  );
});

test("incomplete Evolution setup never drains the durable queue", async () => {
  const { db, rpc } = database([notification]);
  vi.stubEnv("SOS_DELIVERY_NOT_BEFORE", "");
  const send = vi.fn();
  expect(await dispatchDueSosNotifications({}, db, send)).toMatchObject({
    disabled: true,
    claimed: 0,
  });
  expect(rpc).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test.each(["cancelled", "lost lease", "expired lease", "database unavailable"])(
  "%s during connection preflight prevents sendText",
  async (change) => {
    let changed = false;
    const { db, rpc } = database([notification], (table) => {
      if (changed && change === "database unavailable")
        return { data: null, error: { message: "unavailable" } };
      if (table === "sos_events")
        return {
          data: { status: changed && change === "cancelled" ? "cancelled" : "active" },
          error: null,
        };
      return {
        data:
          changed && change === "lost lease"
            ? null
            : {
                id: notification.id,
                claimed_at: new Date(
                  Date.now() - (changed && change === "expired lease" ? 130_000 : 0),
                ).toISOString(),
              },
        error: null,
      };
    });
    let releaseConnection!: (response: Response) => void;
    const pendingConnection = new Promise<Response>((resolve) => {
      releaseConnection = resolve;
    });
    let signalPreflight!: () => void;
    const preflightStarted = new Promise<void>((resolve) => {
      signalPreflight = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") return Response.json({ key: { id: "must-not-send" } });
      signalPreflight();
      return pendingConnection;
    });
    vi.stubGlobal("fetch", fetcher);
    const dispatch = dispatchDueSosNotifications({}, db);
    await preflightStarted;
    changed = true;
    releaseConnection(Response.json({ instance: { instanceName: "qa-instance", state: "open" } }));
    expect(await dispatch).toMatchObject({ accepted: 0, failed: 1, unknown: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "settle_sos_dispatch",
      expect.objectContaining({
        _outcome: "failed",
        _retryable: change === "database unavailable",
      }),
    );
  },
);

test("worker still sends after preflight when SOS and reservation remain current", async () => {
  const { db } = database([notification]);
  const fetcher = fetcherWith(Response.json({ key: { id: "current-event" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await dispatchDueSosNotifications({}, db)).toMatchObject({ accepted: 1, failed: 0 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
