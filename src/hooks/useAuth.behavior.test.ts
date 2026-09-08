import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  stop: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
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
      signUp: mocks.signUp,
      onAuthStateChange: (handler: typeof mocks.authChange) => {
        mocks.authChange = handler;
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
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

test("register sends complete metadata including bike, plate and terms", async () => {
  mocks.signUp.mockResolvedValue({
    data: {
      user: { id: "u-123", email: "piloto@motoanjo.com", identities: [{ id: "1" }] },
      session: null,
    },
    error: null,
  });
  const { useAuth } = await import("./useAuth");
  const { result } = renderHook(useAuth);
  let res: unknown;
  await act(async () => {
    res = await result.current.register({
      name: "João Silva",
      email: "piloto@motoanjo.com",
      phone: "(11) 99999-8888",
      password: "StrongPassword123!",
      bikeModel: "Honda CG 160",
      plate: "abc1d23",
      bloodType: "O+",
      emergencyContact: "Maria Silva",
      emergencyPhone: "(11) 97777-6666",
    });
  });

  expect(mocks.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "piloto@motoanjo.com",
      password: "StrongPassword123!",
      options: expect.objectContaining({
        data: expect.objectContaining({
          name: "João Silva",
          phone: "(11) 99999-8888",
          bike_model: "Honda CG 160",
          plate: "ABC1D23",
          blood_type: "O+",
          emergency_contact: "Maria Silva",
          emergency_phone: "(11) 97777-6666",
        }),
      }),
    }),
  );
  expect(res).toEqual({ status: "confirm_email", user: null });
});

test("register throws already_registered when user has no identities (duplicate email)", async () => {
  mocks.signUp.mockResolvedValue({
    data: {
      user: { id: "u-123", email: "existente@motoanjo.com", identities: [] },
      session: null,
    },
    error: null,
  });
  const { useAuth } = await import("./useAuth");
  const { result } = renderHook(useAuth);
  await act(async () => {
    await expect(
      result.current.register({
        name: "João Silva",
        email: "existente@motoanjo.com",
        phone: "(11) 99999-8888",
        password: "StrongPassword123!",
        bikeModel: "",
        plate: "",
        bloodType: "",
        emergencyContact: "",
        emergencyPhone: "",
      }),
    ).rejects.toThrow("Já existe uma conta com este e-mail");
  });
});
