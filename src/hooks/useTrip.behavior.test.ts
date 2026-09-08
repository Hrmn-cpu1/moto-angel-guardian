import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  stop: vi.fn(async () => {}),
  queue: vi.fn(async () => {}),
  error: vi.fn(),
}));
vi.mock("@/lib/native-protection", () => ({
  readNativeProtection: mocks.read,
  stopNativeProtection: mocks.stop,
}));
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
  queueCompletedTrip: mocks.queue,
  syncCompletedTrips: async () => {},
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn(), warning: vi.fn() } }));
import { useTrip, resetTripRuntime, finalizarViagemAtual } from "./useTrip";

beforeEach(() => {
  resetTripRuntime();
  localStorage.setItem(
    "moto-anjo:viagem",
    JSON.stringify({
      estado: "ativa",
      iniciadaEm: Date.now() - 1000,
      destino: { latitude: -23.5, longitude: -46.6 },
      origemDoDestino: "manual",
    }),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

test.each([
  { phase: "failed", requestId: "offline-request" },
  { phase: "registering", requestId: "in-flight-request" },
  { phase: "countdown" },
])("ending the trip preserves a native $phase SOS before creating history", async (native) => {
  mocks.read.mockResolvedValue({ supported: true, ...native });
  const hook = renderHook(() => useTrip());
  let ended: boolean | undefined;
  await act(async () => {
    ended = await hook.result.current.finalizar(false);
  });
  expect(ended).toBe(false);
  expect(hook.result.current.viagem.estado).toBe("ativa");
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(
    "Confira e cancele o SOS pendente antes de finalizar a viagem.",
  );
});

test("a registered SOS permits ending the trip with atomic protection of newly pending requests", async () => {
  mocks.read.mockResolvedValue({
    supported: true,
    phase: "registered",
    requestId: "request",
    sosEventId: "event",
  });
  const hook = renderHook(() => useTrip());
  let ended: boolean | undefined;
  await act(async () => {
    ended = await finalizarViagemAtual(true);
  });
  expect(ended).toBe(true);
  expect(hook.result.current.viagem.estado).toBe("ocioso");
  expect(mocks.queue).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledWith({ preservePending: true });
});

test("concurrent finalization returns false and creates only one history entry", async () => {
  let resolveRead!: (value: unknown) => void;
  mocks.read.mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  renderHook(() => useTrip());
  const first = finalizarViagemAtual();
  expect(await finalizarViagemAtual()).toBe(false);
  await act(async () => {
    resolveRead({ supported: false, phase: "normal" });
    expect(await first).toBe(true);
  });
  expect(mocks.queue).toHaveBeenCalledOnce();
  expect(await finalizarViagemAtual()).toBe(true);
});

test("a new native SOS rejected by atomic stop never creates completed history", async () => {
  mocks.read.mockResolvedValue({ supported: true, phase: "normal" });
  mocks.stop.mockRejectedValueOnce(new Error("SOS pending"));
  const hook = renderHook(() => useTrip());
  await act(async () => {
    expect(await finalizarViagemAtual()).toBe(false);
  });
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(hook.result.current.viagem.estado).toBe("ativa");
});

test("storage failure after stopping keeps the trip open and explicitly reports limited protection", async () => {
  mocks.read.mockResolvedValue({ supported: true, phase: "normal" });
  mocks.queue.mockRejectedValueOnce(new Error("storage full"));
  const hook = renderHook(() => useTrip());
  await act(async () => {
    expect(await finalizarViagemAtual()).toBe(false);
  });
  expect(mocks.stop).toHaveBeenCalledWith({ preservePending: true });
  expect(hook.result.current.viagem.estado).toBe("ativa");
  expect(mocks.error).toHaveBeenCalledWith(
    "Não foi possível salvar a viagem; ela continua aberta com proteção limitada. Tente novamente.",
  );
});
