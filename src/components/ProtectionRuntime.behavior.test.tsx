import { createElement } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  mount: vi.fn(),
  stop: vi.fn(),
  lock: vi.fn(),
  unlock: vi.fn(),
  trigger: vi.fn(),
  recovering: false,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/dashboard",
}));
vi.mock("@/hooks/useTrip", () => ({ useTrip: () => ({ viagem: { estado: "ativa" } }) }));
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
vi.mock("./SosPanel", () => ({ SosPanel: () => null }));
import { ProtectionRuntime } from "./ProtectionRuntime";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.recovering = false;
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
