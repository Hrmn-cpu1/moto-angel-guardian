import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  configure: vi.fn(),
  stop: vi.fn(async () => {}),
  state: {
    supported: true,
    configured: true,
    armed: true,
    phase: "failed",
    requestId: "preserved-pending-request",
  },
}));
vi.mock("@/lib/native", () => ({ isNativeApp: () => true }));
vi.mock("@/lib/protection-session", () => ({ protectionOwner: () => "user" }));
vi.mock("@/lib/trip-service", () => ({
  assinarEstadoDoServico: () => () => {},
  consultarEstadoDoServico: async () => ({ ativo: true }),
  estadoAtualDoServico: () => ({ ativo: true }),
  iniciarServicoDeViagem: async () => {},
  ouvirEstadoDoServico: () => {},
  pararServicoDeViagem: async () => {},
  servicoDisponivel: () => true,
}));
vi.mock("@/lib/trip-diagnostics", () => ({
  marcarSessaoFinalizada: () => {},
  registrarEventoDeViagem: () => {},
  sessaoAnteriorTerminouMal: () => false,
  setTripDiagnosticState: () => {},
}));
vi.mock("@/lib/trip-history-sync", () => ({
  queueCompletedTrip: async () => {},
  syncCompletedTrips: async () => {},
}));
vi.mock("@/lib/native-protection", () => ({
  NO_NATIVE_PROTECTION: { supported: false, configured: false, armed: false, phase: "normal" },
  readNativeProtection: mocks.read,
  configureNativeProtection: mocks.configure,
  stopNativeProtection: mocks.stop,
  requestNativeSos: vi.fn(),
  cancelNativeAlert: vi.fn(),
}));
import { useNativeProtection } from "./useNativeProtection";
import { useTrip, resetTripRuntime } from "./useTrip";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("cold mount hydrates the persisted active trip without clearing its native pending request", async () => {
  resetTripRuntime();
  const startedAt = Date.now() - 1000;
  localStorage.setItem(
    "moto-anjo:viagem",
    JSON.stringify({
      estado: "ativa",
      iniciadaEm: startedAt,
      destino: { latitude: -23.5, longitude: -46.6 },
      origemDoDestino: "manual",
    }),
  );
  mocks.read.mockResolvedValue(mocks.state);
  mocks.configure.mockResolvedValue(mocks.state);
  const hook = renderHook(() => {
    const trip = useTrip();
    const native = useNativeProtection(trip.hydrated ? trip.viagem.iniciadaEm : undefined);
    return { trip, native };
  });
  await act(async () => {});
  expect(hook.result.current.trip.hydrated).toBe(true);
  expect(hook.result.current.trip.viagem.estado).toBe("ativa");
  expect(mocks.configure).toHaveBeenCalledWith("user", startedAt);
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(hook.result.current.native.state.requestId).toBe("preserved-pending-request");
  localStorage.removeItem("moto-anjo:viagem");
});

test("unknown trip state preserves native pending SOS until persisted trip hydration completes", async () => {
  mocks.read.mockResolvedValue(mocks.state);
  mocks.configure.mockResolvedValue(mocks.state);
  const hook = renderHook(
    ({ startedAt }: { startedAt: number | null | undefined }) => useNativeProtection(startedAt),
    { initialProps: { startedAt: undefined as number | null | undefined } },
  );
  await act(async () => {});
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.configure).not.toHaveBeenCalled();
  expect(hook.result.current.state.requestId).toBe("preserved-pending-request");
  hook.rerender({ startedAt: 1234 });
  await act(async () => {});
  expect(mocks.configure).toHaveBeenCalledWith("user", 1234);
  expect(mocks.stop).not.toHaveBeenCalled();
  hook.rerender({ startedAt: null });
  await act(async () => {});
  expect(mocks.stop).toHaveBeenCalledOnce();
});

test("an Android bridge read failure never enables the browser detector and clears its warning after recovery", async () => {
  vi.useFakeTimers();
  mocks.read.mockRejectedValueOnce(new Error("bridge unavailable")).mockResolvedValue(mocks.state);
  const hook = renderHook(() => useNativeProtection(undefined));
  expect(hook.result.current.state.supported).toBe(true);
  await act(async () => {});
  expect(hook.result.current.state.supported).toBe(true);
  expect(hook.result.current.setupError).toContain("confirmar");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(hook.result.current.setupError).toBeNull();
  expect(hook.result.current.state.requestId).toBe("preserved-pending-request");
});
