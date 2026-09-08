import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  check: vi.fn(),
  request: vi.fn(),
  gps: vi.fn(),
  nativeThen: vi.fn(),
}));
vi.mock("./native.ts", () => ({ isNativeApp: mocks.native }));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: new Proxy(
    { checkPermissions: mocks.check, requestPermissions: mocks.request },
    {
      get(target, property) {
        return property === "then" ? mocks.nativeThen : Reflect.get(target, property);
      },
    },
  ),
}));
import {
  _resetarPermissao,
  consultarPermissao,
  leituraAtual,
  pedirPermissao,
} from "./location-permission";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  _resetarPermissao();
  mocks.native.mockReturnValue(true);
  mocks.nativeThen.mockImplementation((_resolve: unknown, reject: (error: Error) => void) => {
    reject(new Error('"Geolocation.then()" is not implemented on android'));
  });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.gps },
  });
});
afterEach(() => vi.useRealTimers());

test("consulta no boot frio não assimila o Proxy Capacitor como Promise", async () => {
  mocks.check.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
  expect(await consultarPermissao()).toEqual({ status: "concedida", origem: "nativo" });
  expect(leituraAtual().status).toBe("concedida");
  expect(mocks.check).toHaveBeenCalledOnce();
  expect(mocks.nativeThen).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
});

test("permissão já concedida libera sem solicitar novamente ou esperar GPS", async () => {
  mocks.check.mockResolvedValue({ location: "granted" });
  expect((await pedirPermissao()).status).toBe("concedida");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
  expect(mocks.nativeThen).not.toHaveBeenCalled();
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

test("ponte travada usa GPS web sem repetir a consulta nativa", async () => {
  mocks.check.mockImplementation(() => new Promise(() => {}));
  mocks.gps.mockImplementation((success: () => void) => success());
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(2600);
  expect((await pedido).status).toBe("concedida");
  expect(mocks.check).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.gps).toHaveBeenCalledOnce();
});

test("ponte e GPS web sem resposta continuam com limite finito", async () => {
  mocks.check.mockImplementation(() => new Promise(() => {}));
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(15000);
  expect((await pedido).status).toBe("perguntar");
  expect(mocks.check).toHaveBeenCalledOnce();
  expect(mocks.gps).toHaveBeenCalledOnce();
});

test("falha da ponte permite confirmar pelo GPS web", async () => {
  mocks.check.mockRejectedValue(new Error("bridge unavailable"));
  mocks.gps.mockImplementation((success: () => void) => success());
  expect((await pedirPermissao()).status).toBe("concedida");
  expect(mocks.gps).toHaveBeenCalledOnce();
});

test("resposta tardia do diálogo libera durante fallback e ignora erro GPS posterior", async () => {
  mocks.check.mockResolvedValue({ location: "prompt" });
  let responder!: (value: { location: string }) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      responder = resolve;
    }),
  );
  const pedido = pedirPermissao();
  await vi.advanceTimersByTimeAsync(16000);
  expect(mocks.gps).toHaveBeenCalledOnce();
  responder({ location: "granted" });
  await vi.advanceTimersByTimeAsync(0);
  expect((await pedido).status).toBe("concedida");
  mocks.gps.mock.calls[0][1]({ code: 3, PERMISSION_DENIED: 1 });
  expect(leituraAtual().status).toBe("concedida");
  expect(mocks.nativeThen).not.toHaveBeenCalled();
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
