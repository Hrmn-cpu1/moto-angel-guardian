import { createElement } from "react";
import { render, cleanup, act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  mount: vi.fn(),
  stop: vi.fn(),
  lock: vi.fn(),
  unlock: vi.fn(),
  trigger: vi.fn(),
  refresh: vi.fn(),
  reconcile: vi.fn(async () => {}),
  request: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  retrySetup: vi.fn(),
  panel: vi.fn(),
  native: { supported: false, configured: false, armed: false, phase: "normal" } as Record<
    string,
    unknown
  >,
  recovering: false,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/dashboard",
}));
vi.mock("@/hooks/useTrip", () => ({
  useTrip: () => ({ hydrated: true, viagem: { estado: "ativa", iniciadaEm: 100 } }),
}));
vi.mock("@/hooks/useNativeProtection", () => ({
  useNativeProtection: () => ({
    state: mocks.native,
    request: mocks.request,
    cancel: mocks.cancel,
    retrySetup: mocks.retrySetup,
  }),
}));
vi.mock("@/lib/native-protection", () => ({
  reflectActiveSos: async () => {},
  reconcileNativeSos: mocks.reconcile,
}));
vi.mock("@/hooks/useSosController", async () => {
  const { createContext } = await import("react");
  return {
    SosContext: createContext(null),
    useSosRuntime: () => ({
      trigger: mocks.trigger,
      holdMs: 3000,
      recovering: mocks.recovering,
      busy: false,
      sosEventId: null,
      refresh: mocks.refresh,
      open: false,
      phase: "ocioso",
      recipients: [
        { id: "contact", href: "https://wa.me/5511000000000?text=SOS", state: "pronta" },
      ],
      hasContacts: true,
    }),
  };
});
vi.mock("@/hooks/useLiveShare", async () => {
  const { createContext } = await import("react");
  return { LiveShareContext: createContext(null), useLiveShareRuntime: () => ({ sharing: false }) };
});
vi.mock("@/hooks/useCrashDetection", async () => {
  const { useEffect } = await import("react");
  return {
    useCrashDetection: () => {
      useEffect(() => {
        mocks.mount();
        return mocks.stop;
      }, []);
      return {};
    },
  };
});
vi.mock("@/lib/trip-service", () => ({
  ouvirSosDaTelaBloqueada: () => {
    mocks.lock();
    return mocks.unlock;
  },
}));
vi.mock("@/lib/trip-diagnostics", () => ({ registrarEventoDeViagem: vi.fn() }));
vi.mock("@/lib/trip-history-sync", () => ({ syncCompletedTrips: async () => {} }));
vi.mock("./CrashAlert", () => ({ CrashAlert: () => null }));
vi.mock("./SosPanel", () => ({
  SosPanel: ({ sos }: { sos: unknown }) => {
    mocks.panel(sos);
    return null;
  },
}));
import { ProtectionRuntime } from "./ProtectionRuntime";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.recovering = false;
  mocks.native = { supported: false, configured: false, armed: false, phase: "normal" };
  vi.useRealTimers();
});
test("changing the child page preserves crash monitoring and lock SOS listener", () => {
  const { rerender, unmount } = render(
    createElement(ProtectionRuntime, { children: createElement("p", null, "Home") }),
  );
  rerender(createElement(ProtectionRuntime, { children: createElement("p", null, "Comunidade") }));
  expect(mocks.mount).toHaveBeenCalledOnce();
  expect(mocks.lock).toHaveBeenCalledOnce();
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.unlock).not.toHaveBeenCalled();
  unmount();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.unlock).toHaveBeenCalledOnce();
});

test("retained lock SOS is subscribed only after SOS recovery is ready", () => {
  mocks.recovering = true;
  const { rerender } = render(createElement(ProtectionRuntime, { children: null }));
  expect(mocks.lock).not.toHaveBeenCalled();
  mocks.recovering = false;
  rerender(createElement(ProtectionRuntime, { children: null }));
  expect(mocks.lock).toHaveBeenCalledOnce();
});

test("native failure keeps the manual recipients visible and retries the native request", () => {
  mocks.native = {
    supported: true,
    configured: true,
    armed: true,
    phase: "failed",
    requestId: "native-request",
    error: "Sem internet",
  };
  render(createElement(ProtectionRuntime, { children: null }));
  const panel = mocks.panel.mock.lastCall?.[0];
  expect(panel.open).toBe(true);
  expect(panel.phase).toBe("falha_registro");
  expect(panel.requestId).toBe("native-request");
  expect(panel.recipients).toHaveLength(1);
  expect(panel.errorMessage).toContain("WhatsApp");
  panel.retry();
  panel.cancel();
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.trigger).not.toHaveBeenCalled();
});

test("a rejected capability renews setup instead of retrying the rejected token", () => {
  mocks.native = {
    supported: true,
    configured: true,
    armed: false,
    phase: "failed",
    requestId: "native-request",
    needsReconfiguration: true,
  };
  render(createElement(ProtectionRuntime, { children: null }));
  mocks.panel.mock.lastCall?.[0].retry();
  expect(mocks.retrySetup).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

test("an expired native capability renews setup before retrying a pending SOS", () => {
  mocks.native = {
    supported: true,
    configured: false,
    armed: false,
    phase: "failed",
    requestId: "expired-request",
  };
  render(createElement(ProtectionRuntime, { children: null }));
  mocks.panel.mock.lastCall?.[0].retry();
  expect(mocks.retrySetup).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

test("registered SOS awaiting synchronization exposes the manual panel and never opens a new SOS on retry", async () => {
  mocks.native = {
    supported: true,
    configured: true,
    armed: true,
    phase: "registered",
    requestId: "native-request",
    sosEventId: "registered-event",
  };
  render(createElement(ProtectionRuntime, { children: null }));
  const panel = mocks.panel.mock.lastCall?.[0];
  expect(panel.open).toBe(true);
  expect(panel.phase).toBe("aguardando_envio");
  expect(panel.phaseLabel).toContain("aguardando sincronização");
  expect(panel.sosEventId).toBe("registered-event");
  expect(panel.hasContacts).toBe(true);
  expect(panel.recipients).toHaveLength(1);
  await act(async () => {
    panel.retry();
    panel.cancel();
  });
  expect(mocks.reconcile).toHaveBeenCalledWith("registered-event");
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.trigger).not.toHaveBeenCalled();
});

test("registered native SOS retries reconciliation after a transient server failure and stops after six attempts", async () => {
  vi.useFakeTimers();
  mocks.native = {
    supported: true,
    configured: true,
    armed: true,
    phase: "registered",
    requestId: "request",
    sosEventId: "event",
  };
  mocks.reconcile.mockRejectedValueOnce(new Error("offline"));
  render(createElement(ProtectionRuntime, { children: null }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(35_000);
  });
  expect(mocks.reconcile).toHaveBeenCalledTimes(6);
  expect(mocks.refresh).toHaveBeenCalledTimes(6);
  expect(mocks.reconcile).toHaveBeenCalledWith("event");
});
