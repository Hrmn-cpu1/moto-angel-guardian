import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  revoke: vi.fn(),
  query: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("./native-protection.functions", () => ({
  createNativeProtectionSession: mocks.issue,
  revokeNativeProtectionSession: mocks.revoke,
  cancelNativeProtectionRequest: mocks.cancel,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }) }) },
}));
const empty = { supported: true, configured: false, armed: false, phase: "normal" };
const issued = {
  token: "a".repeat(43),
  sessionId: "session",
  expiresAt: "2026-09-09T12:00:00.123456+00:00",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const plugin = {
    estadoProtecaoNativa: vi.fn(async () => empty),
    configurarProtecaoNativa: vi.fn(async () => ({ ...empty, configured: true })),
    limparProtecaoNativa: vi.fn(async () => empty),
    atualizarProtecaoNativa: vi.fn(async () => empty),
    cancelarAlertaNativo: vi.fn(async () => empty),
  };
  Object.assign(window, {
    Capacitor: { isNativePlatform: () => true, Plugins: { ViagemSegura: plugin } },
  });
  return plugin;
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.issue.mockResolvedValue(issued);
  mocks.revoke.mockResolvedValue({ revoked: true });
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "Capacitor");
});

test("native date is normalized from Postgres microseconds to exact Java milliseconds", async () => {
  const plugin = setup();
  const { configureNativeProtection } = await import("./native-protection");
  await configureNativeProtection("owner", Date.now());
  expect(plugin.configurarProtecaoNativa).toHaveBeenCalledWith(
    expect.objectContaining({ expiresAt: "2026-09-09T12:00:00.123Z" }),
  );
});
test("ending a trip clears Android immediately while issuance is still offline; late token never configures", async () => {
  const plugin = setup();
  const pending = deferred<typeof issued>();
  mocks.issue.mockReturnValue(pending.promise);
  const api = await import("./native-protection");
  const configuring = api.configureNativeProtection("owner", Date.now());
  await vi.waitFor(() => expect(mocks.issue).toHaveBeenCalled());
  await api.stopNativeProtection();
  expect(plugin.limparProtecaoNativa).toHaveBeenCalledOnce();
  pending.resolve(issued);
  await configuring;
  expect(plugin.configurarProtecaoNativa).not.toHaveBeenCalled();
  expect(mocks.revoke).toHaveBeenCalledWith({ data: { sessionId: issued.sessionId } });
});
test("a delayed native configure is cleared before any newer configure is allowed", async () => {
  const plugin = setup();
  const pending = deferred<{
    configured: boolean;
    supported: boolean;
    armed: boolean;
    phase: string;
  }>();
  plugin.configurarProtecaoNativa.mockReturnValue(pending.promise);
  const api = await import("./native-protection");
  const configuring = api.configureNativeProtection("owner", Date.now());
  await vi.waitFor(() => expect(plugin.configurarProtecaoNativa).toHaveBeenCalled());
  await api.stopNativeProtection();
  pending.resolve({ ...empty, configured: true });
  expect(await configuring).toMatchObject({ configured: false });
  expect(plugin.limparProtecaoNativa).toHaveBeenCalledTimes(2);
});
test("transient bridge failure remains an error and cannot suppress stop cleanup", async () => {
  const plugin = setup();
  plugin.estadoProtecaoNativa.mockRejectedValue(new Error("bridge failed"));
  const api = await import("./native-protection");
  await expect(api.readNativeProtection()).rejects.toThrow("bridge failed");
  await api.stopNativeProtection();
  expect(plugin.limparProtecaoNativa).toHaveBeenCalledOnce();
});
test("legacy APK UNIMPLEMENTED is unsupported and does not prevent logout", async () => {
  const plugin = setup();
  plugin.estadoProtecaoNativa.mockRejectedValue({ code: "UNIMPLEMENTED" });
  plugin.limparProtecaoNativa.mockRejectedValue({ code: "UNIMPLEMENTED" });
  const api = await import("./native-protection");
  expect(await api.readNativeProtection()).toMatchObject({ supported: false });
  await expect(api.stopNativeProtection()).resolves.toBeUndefined();
});
test("offline, absent or active server event cannot clear persisted native request", async () => {
  const plugin = setup();
  const api = await import("./native-protection");
  for (const result of [
    { data: null, error: { message: "offline" } },
    { data: null, error: null },
    { data: { id: "event", status: "active" }, error: null },
  ]) {
    mocks.query.mockResolvedValue(result);
    expect(await api.reconcileNativeSos("event")).toBe(false);
  }
  expect(plugin.atualizarProtecaoNativa).not.toHaveBeenCalled();
  mocks.query.mockResolvedValue({ data: { id: "event", status: "cancelled" }, error: null });
  expect(await api.reconcileNativeSos("event")).toBe(true);
  expect(plugin.atualizarProtecaoNativa).toHaveBeenCalledWith({
    sosEventId: null,
    closedEventId: "event",
  });
});

test("pending cancellation only clears exact native request after server confirmation", async () => {
  const plugin = setup();
  plugin.cancelarAlertaNativo.mockRejectedValue(new Error("server confirmation required"));
  const pendingState = { ...empty, phase: "failed", requestId: "pending", sessionId: "session" };
  plugin.estadoProtecaoNativa.mockResolvedValue(pendingState);
  const api = await import("./native-protection");
  mocks.cancel.mockRejectedValueOnce(new Error("offline"));
  await expect(api.cancelNativeAlert()).rejects.toThrow("offline");
  expect(plugin.limparProtecaoNativa).not.toHaveBeenCalled();
  mocks.cancel.mockResolvedValueOnce({ cancelled: true, status: "absent", sosEventId: null });
  await api.cancelNativeAlert();
  expect(plugin.limparProtecaoNativa).toHaveBeenCalledWith({
    expectedSessionId: "session",
    expectedRequestId: "pending",
  });
});

test("atomic stop refusal leaves the capability available for resolving pending SOS", async () => {
  const plugin = setup();
  plugin.limparProtecaoNativa.mockRejectedValue({ code: "NATIVE_SOS_PENDING" });
  const pendingState = { ...empty, phase: "failed", requestId: "pending", sessionId: "session" };
  plugin.estadoProtecaoNativa.mockResolvedValue(pendingState);
  const api = await import("./native-protection");
  await expect(api.stopNativeProtection({ preservePending: true })).rejects.toEqual({
    code: "NATIVE_SOS_PENDING",
  });
  expect(plugin.limparProtecaoNativa).toHaveBeenCalledWith({ preservePending: true });
  expect(mocks.revoke).not.toHaveBeenCalled();
});
