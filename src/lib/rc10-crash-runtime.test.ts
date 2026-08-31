import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CrashDetectionEngine, decidirAcionamento, type AmostraSensor } from "./crash-detection.ts";
import { PERIODO_AMOSTRA_MS, moduloAceleracao, moduloRotacao } from "./crash-sensors.ts";

/**
 * P0.1 — a detecção de queda deixou de ser biblioteca sem consumidor.
 *
 * Estes testes cobrem a PONTE (normalização + ciclo de vida do listener +
 * integração com o SOS existente). O motor em si continua coberto por
 * `crash-detection.test.ts`, que não foi alterado.
 */

/* ================================================================== *
 * Normalização das leituras físicas
 * ================================================================== */

test("modulo de aceleracao usa os tres eixos", () => {
  assert.equal(moduloAceleracao({ x: 3, y: 4, z: 0 }), 5);
});

test("leitura incompleta não vira número inventado", () => {
  assert.equal(moduloAceleracao({ x: 3, y: null, z: 0 }), null);
  assert.equal(moduloAceleracao(null), null);
  assert.equal(moduloRotacao(null), null);
});

test("rotacao aceita eixos parciais sem simular os ausentes", () => {
  assert.equal(moduloRotacao({ alpha: 3, beta: 4 }), 5);
});

test("amostragem é limitada a ~5 Hz", () => {
  assert.equal(PERIODO_AMOSTRA_MS, 200);
});

/* ================================================================== *
 * Ciclo de vida do listener (fonte única, sem duplicação)
 * ================================================================== */

type Ouvinte = (e: unknown) => void;

async function comAmbienteDeSensores(
  fn: (api: { ouvintes: Map<string, Set<Ouvinte>> }) => Promise<void> | void,
) {
  const ouvintes = new Map<string, Set<Ouvinte>>();
  const g = globalThis as Record<string, unknown>;
  const antes = { window: g.window, navigator: g.navigator };
  const win = {
    DeviceMotionEvent: function () {},
    addEventListener(nome: string, cb: Ouvinte) {
      if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
      ouvintes.get(nome)!.add(cb);
    },
    removeEventListener(nome: string, cb: Ouvinte) {
      ouvintes.get(nome)?.delete(cb);
    },
  };
  g.window = win;
  Object.defineProperty(g, "navigator", {
    value: { geolocation: undefined },
    configurable: true,
  });
  try {
    await fn({ ouvintes });
  } finally {
    g.window = antes.window;
    Object.defineProperty(g, "navigator", { value: antes.navigator, configurable: true });
  }
}

test("o listener físico começa uma vez e é removido no fim", async () => {
  await comAmbienteDeSensores(async ({ ouvintes }) => {
    const mod = await import(`./crash-sensors.ts?ciclo=${Date.now()}`);
    const a = mod.assinarSensoresDeQueda(() => {});
    const b = mod.assinarSensoresDeQueda(() => {});
    assert.equal(ouvintes.get("devicemotion")?.size, 1, "um único listener físico");
    assert.equal(mod.totalDeAssinantesDeQueda(), 2);
    a();
    assert.equal(mod.capturaDeQuedaAtiva(), true, "ainda há assinante");
    b();
    assert.equal(mod.capturaDeQuedaAtiva(), false);
    assert.equal(ouvintes.get("devicemotion")?.size ?? 0, 0, "listener removido");
  });
});

test("iniciar e parar viagem várias vezes não empilha listeners", async () => {
  await comAmbienteDeSensores(async ({ ouvintes }) => {
    const mod = await import(`./crash-sensors.ts?ciclos=${Date.now()}`);
    for (let i = 0; i < 5; i++) mod.assinarSensoresDeQueda(() => {})();
    assert.equal(ouvintes.get("devicemotion")?.size ?? 0, 0);
    const cancelar = mod.assinarSensoresDeQueda(() => {});
    assert.equal(ouvintes.get("devicemotion")?.size, 1);
    cancelar();
    cancelar(); // cancelador idempotente
    assert.equal(mod.totalDeAssinantesDeQueda(), 0);
  });
});

test("sem acelerômetro a captura não finge estar completa", async () => {
  const g = globalThis as Record<string, unknown>;
  const antes = g.window;
  g.window = { addEventListener() {}, removeEventListener() {} };
  try {
    const mod = await import(`./crash-sensors.ts?semSensor=${Date.now()}`);
    assert.equal(mod.movimentoDisponivel(), false);
    assert.equal(await mod.pedirPermissaoDeMovimento(), "indisponivel");
  } finally {
    g.window = antes;
  }
});

/* ================================================================== *
 * Segurança contra falso positivo (fluxo real de amostras)
 * ================================================================== */

function amostra(t: number, p: Partial<AmostraSensor>): AmostraSensor {
  return { t, speedKmh: 40, accelMs2: 2, gyroDegS: 5, accuracyM: 8, ...p };
}

test("sequência normal alimentada pela ponte não dispara queda", () => {
  const e = new CrashDetectionEngine();
  let r = e.processar(amostra(0, {}));
  for (let i = 1; i < 60; i++) r = e.processar(amostra(i * PERIODO_AMOSTRA_MS, {}));
  assert.equal(r.estado, "normal");
  assert.equal(decidirAcionamento({ ...ctx, estado: r.estado }).acionar, false);
});

const ctx = {
  deteccaoLigada: true,
  modoDiagnostico: false,
  sosAtivo: false,
  estado: "normal" as const,
};

test("pico isolado de aceleração não vira SOS", () => {
  const e = new CrashDetectionEngine();
  e.processar(amostra(0, {}));
  const r = e.processar(amostra(200, { accelMs2: 40 }));
  assert.notEqual(r.estado, "sos");
  assert.equal(decidirAcionamento({ ...ctx, estado: r.estado }).acionar, false);
});

test("assinatura compatível chega a countdown e só então pode virar SOS", () => {
  const e = new CrashDetectionEngine();
  let t = 0;
  for (let i = 0; i < 10; i++) e.processar(amostra((t += 200), { speedKmh: 45 }));
  e.processar(amostra((t += 200), { accelMs2: 40, speedKmh: 45 }));
  e.processar(amostra((t += 200), { speedKmh: 0 }));
  let r = e.processar(amostra((t += 200), { speedKmh: 0 }));
  assert.equal(r.estado, "candidate");
  assert.equal(decidirAcionamento({ ...ctx, estado: r.estado }).acionar, false);
  for (let i = 0; i < 40 && r.estado === "candidate"; i++) {
    r = e.processar(amostra((t += 200), { speedKmh: 0 }));
  }
  assert.equal(r.estado, "countdown");
  // countdown ainda NÃO aciona: quem confirma é a interface ou o relógio.
  assert.equal(decidirAcionamento({ ...ctx, estado: r.estado }).acionar, false);
  const confirmado = e.confirmar();
  assert.equal(decidirAcionamento({ ...ctx, estado: confirmado.estado }).acionar, true);
});

test("cancelamento impede a escalada", () => {
  const e = new CrashDetectionEngine();
  const r = e.cancelar();
  assert.equal(r.estado, "cancelled");
  assert.equal(decidirAcionamento({ ...ctx, estado: r.estado }).acionar, false);
});

test("SOS já ativo não gera um segundo evento", () => {
  const d = decidirAcionamento({ ...ctx, estado: "sos", sosAtivo: true });
  assert.equal(d.acionar, false);
});

test("origem do acionamento é a existente, sem pipeline novo", () => {
  const d = decidirAcionamento({ ...ctx, estado: "sos" });
  assert.equal(d.origem, "automatic_crash_detection");
});

/* ================================================================== *
 * Integração estrutural: nada de mock em produção
 * ================================================================== */

const sensores = readFileSync("src/lib/crash-sensors.ts", "utf8");
const hook = readFileSync("src/hooks/useCrashDetection.ts", "utf8");
const home = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

/** Remove comentários: o que importa é o CÓDIGO, não a prosa que o explica. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("a captura não fabrica leituras", () => {
  assert.ok(!/Math\.random|mock|fake|simula/i.test(semComentarios(sensores)));
});

test("o motor tem consumidor de runtime", () => {
  assert.match(hook, /CrashDetectionEngine/);
  assert.match(hook, /assinarSensoresDeQueda/);
  assert.match(home, /useCrashDetection/);
});

test("a queda usa o SOS existente, não um segundo sistema", () => {
  assert.ok(
    !/supabase|whatsapp|sos_open/i.test(semComentarios(hook)),
    "o hook não fala com o backend",
  );
  assert.match(home, /aoAcionarSos: \(\) => sos\.trigger/);
});

test("os sensores só rodam com a viagem ativa", () => {
  assert.match(home, /ativo: viagemAtiva/);
  assert.match(hook, /if \(!ativo \|\| !deteccaoLigada\) return;/);
});
