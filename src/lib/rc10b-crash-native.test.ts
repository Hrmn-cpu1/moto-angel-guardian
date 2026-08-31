import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * P0.1b — aquisição de sensores no serviço nativo.
 *
 * O que estes testes provam: o contrato da ponte (evento `movimento`,
 * prioridade sobre `devicemotion`, ciclo de vida, sensor ausente e
 * reconexão) e o registro/cancelamento do listener no código Android.
 *
 * O que eles NÃO provam: que o Android continua entregando amostras em Doze
 * com a tela bloqueada. Isso só se comprova em aparelho físico e segue
 * classificado como NOT PROVEN.
 */

type Ouvinte = (dados: unknown) => void;

interface AmbienteNativo {
  ouvintes: Map<string, Set<Ouvinte>>;
  webListeners: Map<string, Set<Ouvinte>>;
  remocoes: number;
  sensores: { aceleracao: boolean; giroscopio: boolean; capturando: boolean };
  emitirMovimento: (m: Record<string, number>) => void;
  emitirDeviceMotion: (accel: number) => void;
}

async function comAppNativo(
  fn: (api: AmbienteNativo, mod: typeof import("./crash-sensors.ts")) => Promise<void> | void,
  opcoes: { comAcelerometro?: boolean; comPlugin?: boolean } = {},
) {
  const { comAcelerometro = true, comPlugin = true } = opcoes;
  const ouvintes = new Map<string, Set<Ouvinte>>();
  const webListeners = new Map<string, Set<Ouvinte>>();
  const estado: AmbienteNativo = {
    ouvintes,
    webListeners,
    remocoes: 0,
    sensores: { aceleracao: comAcelerometro, giroscopio: comAcelerometro, capturando: true },
    emitirMovimento: (m) => {
      for (const cb of ouvintes.get("movimento") ?? []) cb(m);
    },
    emitirDeviceMotion: (accel) => {
      for (const cb of webListeners.get("devicemotion") ?? [])
        cb({ acceleration: { x: accel, y: 0, z: 0 }, rotationRate: null });
    },
  };

  const plugin = {
    addListener(evento: string, cb: Ouvinte) {
      if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
      ouvintes.get(evento)!.add(cb);
      // Capacitor 7 devolve o handle SÍNCRONO nos plugins nativos.
      return {
        remove() {
          estado.remocoes += 1;
          ouvintes.get(evento)!.delete(cb);
        },
      };
    },
    estadoSensores: async () => estado.sensores,
  };

  const g = globalThis as Record<string, unknown>;
  const antes = { window: g.window, navigator: g.navigator };
  g.window = {
    DeviceMotionEvent: function () {},
    location: { pathname: "/dashboard", href: "http://localhost/dashboard" },
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: comPlugin ? { ViagemSegura: plugin } : {},
    },
    addEventListener(nome: string, cb: Ouvinte) {
      if (!webListeners.has(nome)) webListeners.set(nome, new Set());
      webListeners.get(nome)!.add(cb);
    },
    removeEventListener(nome: string, cb: Ouvinte) {
      webListeners.get(nome)?.delete(cb);
    },
  };
  Object.defineProperty(g, "navigator", {
    value: { geolocation: undefined },
    configurable: true,
  });

  try {
    const mod = (await import(
      `./crash-sensors.ts?nativo=${Math.random()}`
    )) as typeof import("./crash-sensors.ts");
    await fn(estado, mod);
  } finally {
    g.window = antes.window;
    Object.defineProperty(g, "navigator", { value: antes.navigator, configurable: true });
  }
}

/** O registro do listener nativo é assíncrono (async IIFE no trip-service). */
const assentar = () => new Promise((r) => setTimeout(r, 0));

/* ================================================================== *
 * Ciclo de vida
 * ================================================================== */

test("o listener nativo sobe com o primeiro assinante e cai com o último", async () => {
  await comAppNativo(async (env, mod) => {
    const a = mod.assinarSensoresDeQueda(() => {});
    await assentar();
    assert.equal(env.ouvintes.get("movimento")?.size, 1, "um listener nativo");
    const b = mod.assinarSensoresDeQueda(() => {});
    await assentar();
    assert.equal(env.ouvintes.get("movimento")?.size, 1, "sem duplicação por assinante");
    a();
    assert.equal(env.ouvintes.get("movimento")?.size, 1, "ainda há assinante");
    b();
    await assentar();
    assert.equal(env.ouvintes.get("movimento")?.size ?? 0, 0, "removido no fim da viagem");
    assert.ok(env.remocoes >= 1, "remove() foi chamado");
  });
});

test("iniciar e parar a viagem várias vezes não empilha listeners nativos", async () => {
  await comAppNativo(async (env, mod) => {
    for (let i = 0; i < 4; i++) {
      const cancelar = mod.assinarSensoresDeQueda(() => {});
      await assentar();
      cancelar();
      await assentar();
    }
    assert.equal(env.ouvintes.get("movimento")?.size ?? 0, 0);
    const cancelar = mod.assinarSensoresDeQueda(() => {});
    await assentar();
    assert.equal(env.ouvintes.get("movimento")?.size, 1);
    cancelar();
  });
});

/* ================================================================== *
 * Prioridade da fonte e reconexão
 * ================================================================== */

test("amostra nativa alimenta o motor e vira a fonte ativa", async () => {
  await comAppNativo(async (env, mod) => {
    const recebidas: { t: number; accelMs2: number | null }[] = [];
    const cancelar = mod.assinarSensoresDeQueda((a) =>
      recebidas.push({ t: a.t, accelMs2: a.accelMs2 ?? null }),
    );
    await assentar();
    env.emitirMovimento({ accelMs2: 42, gyroDegS: 12, monotonicoMs: 1000, quandoMs: Date.now() });
    assert.equal(recebidas.length, 1);
    assert.equal(recebidas[0]!.accelMs2, 42);
    assert.equal(mod.fonteDeMovimento(), "nativa");
    cancelar();
  });
});

test("o tempo da amostra nativa preserva o intervalo do relógio monotônico", async () => {
  await comAppNativo(async (env, mod) => {
    const ts: number[] = [];
    const cancelar = mod.assinarSensoresDeQueda((a) => ts.push(a.t));
    await assentar();
    env.emitirMovimento({ accelMs2: 3, gyroDegS: 1, monotonicoMs: 5000, quandoMs: 1 });
    env.emitirMovimento({ accelMs2: 4, gyroDegS: 1, monotonicoMs: 5400, quandoMs: 2 });
    assert.equal(ts.length, 2);
    assert.equal(ts[1]! - ts[0]!, 400, "o delta é o do aparelho, não o da WebView");
    cancelar();
  });
});

test("com nativo emitindo, o devicemotion da WebView é ignorado", async () => {
  await comAppNativo(async (env, mod) => {
    const valores: (number | null)[] = [];
    const cancelar = mod.assinarSensoresDeQueda((a) => valores.push(a.accelMs2 ?? null));
    await assentar();
    env.emitirMovimento({ accelMs2: 30, gyroDegS: 0, monotonicoMs: 100, quandoMs: 1 });
    env.emitirDeviceMotion(99);
    assert.deepEqual(valores, [30], "sem amostra duplicada pela WebView");
    assert.equal(mod.fonteDeMovimento(), "nativa");
    cancelar();
  });
});

test("sem plugin nativo o devicemotion continua sendo a fonte", async () => {
  await comAppNativo(
    async (env, mod) => {
      const valores: (number | null)[] = [];
      const cancelar = mod.assinarSensoresDeQueda((a) => valores.push(a.accelMs2 ?? null));
      await assentar();
      assert.equal(env.ouvintes.get("movimento")?.size ?? 0, 0);
      env.emitirDeviceMotion(7);
      assert.deepEqual(valores, [7]);
      assert.equal(mod.fonteDeMovimento(), "webview");
      cancelar();
    },
    { comPlugin: false },
  );
});

test("o silêncio do nativo devolve a palavra ao devicemotion (reconexão)", async () => {
  await comAppNativo(async (env, mod) => {
    const valores: (number | null)[] = [];
    const cancelar = mod.assinarSensoresDeQueda((a) => valores.push(a.accelMs2 ?? null));
    await assentar();
    env.emitirMovimento({ accelMs2: 10, gyroDegS: 0, monotonicoMs: 0, quandoMs: 1 });
    assert.equal(mod.fonteDeMovimento(), "nativa");

    // Serviço calado por mais que o timeout: a WebView reassume em vez de
    // deixar o motor sem dado nenhum.
    const agoraReal = Date.now;
    Date.now = () => agoraReal() + mod.TIMEOUT_NATIVO_MS + 500;
    try {
      env.emitirDeviceMotion(8);
    } finally {
      Date.now = agoraReal;
    }
    assert.deepEqual(valores, [10, 8]);
    assert.equal(mod.fonteDeMovimento(), "webview");

    // E quando o serviço volta, ele retoma a prioridade.
    env.emitirMovimento({ accelMs2: 11, gyroDegS: 0, monotonicoMs: 900, quandoMs: 2 });
    assert.equal(mod.fonteDeMovimento(), "nativa");
    cancelar();
  });
});

/* ================================================================== *
 * Sensor ausente — comportamento honesto
 * ================================================================== */

test("aparelho sem acelerômetro é reportado como indisponível, não como zero", async () => {
  await comAppNativo(
    async (env, mod) => {
      const cancelar = mod.assinarSensoresDeQueda(() => {});
      await assentar();
      await assentar();
      const s = mod.sensoresNativosConhecidos();
      assert.equal(s.aceleracao, false);
      assert.equal(s.giroscopio, false);
      cancelar();
    },
    { comAcelerometro: false },
  );
});

test("amostra nativa sem giroscópio não inventa rotação", async () => {
  await comAppNativo(async (env, mod) => {
    const recebidas: (number | null)[] = [];
    const cancelar = mod.assinarSensoresDeQueda((a) => recebidas.push(a.gyroDegS ?? null));
    await assentar();
    // -1 é o "não informado" do Android; nunca deve virar 0.
    env.emitirMovimento({ accelMs2: 5, gyroDegS: -1, monotonicoMs: 10, quandoMs: 1 });
    assert.deepEqual(recebidas, [null]);
    cancelar();
  });
});

test("payload nativo inválido é descartado sem alimentar o motor", async () => {
  await comAppNativo(async (env, mod) => {
    let chamadas = 0;
    const cancelar = mod.assinarSensoresDeQueda(() => (chamadas += 1));
    await assentar();
    env.emitirMovimento({ gyroDegS: 1 } as unknown as Record<string, number>);
    assert.equal(chamadas, 0);
    cancelar();
  });
});

/* ================================================================== *
 * Camada Android — o que o código-fonte precisa garantir
 * ================================================================== */

const servico = readFileSync(
  "android/app/src/main/java/com/motoanjo/app/ViagemSeguraService.java",
  "utf8",
);
const pluginJava = readFileSync(
  "android/app/src/main/java/com/motoanjo/app/ViagemSeguraPlugin.java",
  "utf8",
);

test("o serviço registra e cancela o SensorEventListener", () => {
  assert.match(servico, /registerListener\(/);
  assert.match(servico, /unregisterListener\(/);
  assert.match(servico, /private void iniciarSensores\(\)/);
  assert.match(servico, /private void pararSensores\(\)/);
});

test("a captura de movimento acompanha o ciclo de vida da viagem", () => {
  // Sobe junto com a captura de posição (já dentro do foreground service) e
  // cai no mesmo `pararCaptura` — nunca no boot, nunca fora de viagem.
  assert.match(servico, /capturando = true;[\s\S]{0,200}iniciarSensores\(\);/);
  assert.match(servico, /private void pararCaptura\(\) \{\s*pararSensores\(\);/);
});

test("um listener por serviço: iniciarSensores é idempotente", () => {
  assert.match(servico, /if \(capturandoMovimento\) return;/);
});

test("a frequência entregue é limitada e documentada", () => {
  assert.match(servico, /PERIODO_MOVIMENTO_MS = 200L/);
});

test("o timestamp nativo é monotônico", () => {
  assert.match(servico, /SystemClock\.elapsedRealtime\(\)/);
  assert.ok(
    !/System\.currentTimeMillis\(\)\s*-\s*ultimaEntregaMovimento/.test(servico),
    "a janela não pode depender do relógio de parede",
  );
});

test("sensor ausente não vira valor simulado no Android", () => {
  assert.match(servico, /ultimoAccel = -1f;/);
  assert.match(servico, /ultimoGyro = -1f;/);
});

test("o plugin encaminha movimento sem abrir um segundo SOS", () => {
  assert.match(pluginJava, /notifyListeners\("movimento"/);
  assert.ok(
    !/sos|SOS/.test(pluginJava),
    "a camada nativa não conhece SOS: o acionamento continua único, no JS",
  );
});

test("o app pode perguntar ao Android o que existe de hardware", () => {
  assert.match(pluginJava, /public void estadoSensores\(PluginCall call\)/);
});

test("nenhum mock de sensor no código de produção", () => {
  const fonte = readFileSync("src/lib/crash-sensors.ts", "utf8");
  assert.ok(!/Math\.random|fakeAccel|mockSensor|simular/i.test(fonte));
  assert.ok(!/Math\.random|SensorSimul/i.test(servico));
});
