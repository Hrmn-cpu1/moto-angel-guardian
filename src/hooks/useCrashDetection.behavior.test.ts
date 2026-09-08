import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sample: null as null | ((v: unknown) => void), stop: vi.fn() }));
vi.mock("@/lib/crash-sensors", () => ({
  assinarSensoresDeQueda: (cb: (v: unknown) => void) => {
    mocks.sample = cb;
    return mocks.stop;
  },
  fonteDeMovimento: () => "nativa",
  movimentoDisponivel: () => true,
  pedirPermissaoDeMovimento: async () => "disponivel",
}));
vi.mock("@/lib/trip-service", () => ({
  consultarSensoresNativos: async () => ({ aceleracao: true }),
}));
vi.mock("@/lib/trip-diagnostics", () => ({ registrarEventoDeViagem: vi.fn() }));
vi.mock("@/lib/crash-detection", () => ({
  COUNTDOWN_PADRAO_S: 15,
  segundosRestantes: (start: number, now: number) =>
    Math.max(0, 15 - Math.floor((now - start) / 1000)),
  decidirAcionamento: (o: { estado: string; sosAtivo: boolean }) => ({
    acionar: o.estado === "sos" && !o.sosAtivo,
    motivo: "test",
  }),
  CrashDetectionEngine: class {
    reset() {}
    processar() {
      return { estado: "countdown", motivo: "test", sinais: [] };
    }
    confirmar() {
      return { estado: "sos", motivo: "test" };
    }
    cancelar() {
      return { estado: "cancelled", motivo: "test" };
    }
  },
}));
import { useCrashDetection } from "./useCrashDetection";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test("finishing a trip cancels an armed countdown without sending a late SOS", async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ ativo }) => useCrashDetection({ ativo, sosAtivo: false, aoAcionarSos: send }),
    { initialProps: { ativo: true } },
  );
  await act(async () => {
    mocks.sample?.({});
  });
  expect(result.current.estado).toBe("countdown");
  rerender({ ativo: false });
  act(() => {
    vi.advanceTimersByTime(20_000);
  });
  expect(send).not.toHaveBeenCalled();
  expect(result.current.estado).toBe("normal");
  expect(mocks.stop).toHaveBeenCalledOnce();
  unmount();
});

test("an unanswered countdown requests the shared SOS exactly once", async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const { unmount } = renderHook(() =>
    useCrashDetection({ ativo: true, sosAtivo: false, aoAcionarSos: send }),
  );
  await act(async () => {
    mocks.sample?.({});
  });
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(send).toHaveBeenCalledOnce();
  unmount();
});
