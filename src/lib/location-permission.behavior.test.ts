import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  check: vi.fn(),
  request: vi.fn(),
  gps: vi.fn(),
}));
vi.mock("./native.ts", () => ({ isNativeApp: mocks.native }));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: { checkPermissions: mocks.check, requestPermissions: mocks.request },
}));
import { _resetarPermissao, leituraAtual, pedirPermissao } from "./location-permission";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  _resetarPermissao();
  mocks.native.mockReturnValue(true);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.gps },
  });
});
afterEach(() => vi.useRealTimers());

test("permissão já concedida libera sem solicitar novamente ou esperar GPS", async () => {
  mocks.check.mockResolvedValue({ location: "granted" });
  expect((await pedirPermissao()).status).toBe("concedida");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
});

test("localização aproximada concedida também libera a tela", async () => {
  mocks.check.mockResolvedValue({ location: "prompt", coarseLocation: "granted" });
  expect((await pedirPermissao()).status).toBe("concedida");
  expect(mocks.request).not.toHaveBeenCalled();
});

test("recusa no diálogo mantém a tela bloqueada sem tentar obter coordenadas", async () => {
  mocks.check.mockResolvedValue({ location: "prompt" });
  mocks.request.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
  expect((await pedirPermissao()).status).toBe("negada_permanente");
  expect(mocks.gps).not.toHaveBeenCalled();
});

test("ponte travada termina sem iniciar uma segunda espera por GPS", async () => {
  mocks.check.mockImplementation(() => new Promise(() => {}));
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(2600);
  expect((await pedido).status).toBe("perguntar");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
});

test("resposta tardia do diálogo atualiza a permissão após o limite", async () => {
  mocks.check.mockResolvedValue({ location: "prompt" });
  let responder!: (value: { location: string }) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      responder = resolve;
    }),
  );
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(16000);
  expect((await pedido).status).toBe("perguntar");
  responder({ location: "granted" });
  await vi.advanceTimersByTimeAsync(0);
  expect(leituraAtual().status).toBe("concedida");
  expect(mocks.gps).not.toHaveBeenCalled();
});

test("web libera ao conceder permissão mesmo sem coordenada e ignora erro tardio", async () => {
  mocks.native.mockReturnValue(false);
  const permissao = { state: "prompt", onchange: () => {} };
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue(permissao) },
  });
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.gps).toHaveBeenCalledOnce();
  permissao.state = "granted";
  permissao.onchange();
  expect((await pedido).status).toBe("concedida");
  mocks.gps.mock.calls[0][1]({ code: 3, PERMISSION_DENIED: 1 });
  expect(leituraAtual().status).toBe("concedida");
});
