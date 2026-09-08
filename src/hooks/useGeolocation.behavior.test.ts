import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ watch: vi.fn(), gps: vi.fn() }));
vi.mock("@/lib/geo-watch", () => ({ assinarPosicao: mocks.watch }));
import { useGeolocation } from "./useGeolocation";

const position = (timestamp: number) => ({
  coords: { latitude: -23, longitude: -46, accuracy: 20 },
  timestamp,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.watch.mockReturnValue(() => {});
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.gps },
  });
});

test("mapa aceita leitura inicial rápida mas captura padrão do SOS exige posição nova", async () => {
  mocks.gps.mockImplementation((success) => success(position(1000)));
  const { result } = renderHook(() => useGeolocation());
  await act(async () => {
    await result.current.capture({ initial: true });
  });
  expect(mocks.gps.mock.calls[0][2]).toEqual({
    enableHighAccuracy: false,
    maximumAge: 30000,
    timeout: 5000,
  });
  await act(async () => {
    await result.current.capture();
  });
  expect(mocks.gps.mock.calls[1][2]).toEqual({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  });
});

test("leitura inicial atrasada não substitui posição mais recente do acompanhamento", async () => {
  const { result } = renderHook(() => useGeolocation());
  let pedido!: ReturnType<typeof result.current.capture>;
  act(() => {
    result.current.startWatch();
    pedido = result.current.capture({ initial: true });
  });
  act(() => mocks.watch.mock.calls[0][0].aoReceber(position(2000)));
  await act(async () => {
    mocks.gps.mock.calls[0][0](position(1000));
    await pedido;
  });
  expect(result.current.position?.timestamp).toBe(2000);
});
