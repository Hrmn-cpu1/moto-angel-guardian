import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  stop: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
  order: [] as string[],
  authChange: null as null | ((event: string, session: null) => void),
}));
vi.mock("@/hooks/useTrip", () => ({
  finalizarViagemAtual: mocks.finish,
  resetTripRuntime: mocks.reset,
}));
vi.mock("@/lib/native-protection", () => ({ stopNativeProtection: mocks.stop }));
vi.mock("@/lib/native-auth", () => ({
  subscribeNativeAuth: () => () => {},
  getNativeAuthSnapshot: () => false,
  signInWithGoogleNative: vi.fn(),
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: {} } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: mocks.signOut,
      onAuthStateChange: (handler: typeof mocks.authChange) => {
        mocks.authChange = handler;
      },
    },
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.order = [];
  mocks.finish.mockImplementation(async () => {
    mocks.order.push("finish");
    return true;
  });
  mocks.stop.mockImplementation(async () => {
    mocks.order.push("stop");
  });
  mocks.signOut.mockImplementation(async () => {
    mocks.order.push("signOut");
    return { error: null };
  });
  for (const name of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PROJECT_ID",
  ])
    vi.stubEnv(name, "qa");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
test("logout finalizes the trip and stops native protection before signing out", async () => {
  const { useAuth } = await import("./useAuth");
  const { result } = renderHook(useAuth);
  await act(async () => {
    await result.current.logout();
  });
  expect(mocks.order).toEqual(["finish", "stop", "signOut"]);
  expect(mocks.stop).toHaveBeenCalledWith({ preservePending: true });
});
test("pending SOS or failed trip finalization prevents logout", async () => {
  mocks.finish.mockResolvedValue(false);
  const { useAuth } = await import("./useAuth");
  const { result } = renderHook(useAuth);
  await act(async () => {
    await expect(result.current.logout()).rejects.toThrow("SOS pendente");
  });
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
});
test("external sign-out resets the native trip and its persisted state", async () => {
  localStorage.setItem("moto-anjo:viagem", JSON.stringify({ estado: "ativa" }));
  const { useAuth } = await import("./useAuth");
  renderHook(useAuth);
  await act(async () => {
    mocks.authChange?.("SIGNED_OUT", null);
  });
  expect(mocks.reset).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem("moto-anjo:viagem") || "null")?.estado).not.toBe("ativa");
});
