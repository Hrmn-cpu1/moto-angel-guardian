import test from "node:test";
import assert from "node:assert/strict";
import {
  CrashDetectionEngine,
  countdownTerminou,
  decidirAcionamento,
  segundosRestantes,
  type AmostraSensor,
} from "./crash-detection.ts";

/**
 * Cenários sintéticos. Nenhum teste aqui precisa de moto, aparelho ou queda
 * real — é exatamente por isso que o motor foi separado da captura.
 */

/** Gera amostras a cada `passo` ms. */
function serie(
  passos: Array<Partial<AmostraSensor> & { speedKmh: number | null }>,
  passo = 500,
): AmostraSensor[] {
  return passos.map((p, i) => ({
    t: i * passo,
    speedKmh: p.speedKmh,
    accelMs2: p.accelMs2 ?? 1,
    gyroDegS: p.gyroDegS ?? 5,
    accuracyM: p.accuracyM ?? 8,
  }));
}

const rodar = (amostras: AmostraSensor[]) => new CrashDetectionEngine().processarSerie(amostras);

/* ================================================================== *
 * Nada disso pode virar alarme
 * ================================================================== */

test("pilotagem normal não dispara nada", () => {
  const r = rodar(serie(Array.from({ length: 40 }, () => ({ speedKmh: 42 }))));
  assert.equal(r.estado, "normal");
});

test("curva normal: inclinar a moto não é queda", () => {
  // Giro sustentado e velocidade preservada — é exatamente uma curva.
  const r = rodar(
    serie([
      ...Array.from({ length: 10 }, () => ({ speedKmh: 40 })),
      { speedKmh: 38, gyroDegS: 120 },
      { speedKmh: 36, gyroDegS: 160 },
      { speedKmh: 37, gyroDegS: 140 },
      ...Array.from({ length: 10 }, () => ({ speedKmh: 40 })),
    ]),
  );
  assert.equal(r.estado, "normal");
});

test("frenagem forte, sozinha, não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 10 }, () => ({ speedKmh: 50 })),
      { speedKmh: 30 },
      { speedKmh: 12 },
      { speedKmh: 0 },
      ...Array.from({ length: 6 }, () => ({ speedKmh: 0 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown");
});

test("buraco: pico de aceleração sozinho não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 8 }, () => ({ speedKmh: 45 })),
      { speedKmh: 44, accelMs2: 30 },
      ...Array.from({ length: 24 }, () => ({ speedKmh: 45 })),
    ]),
  );
  // `anomaly` é estado intermediário, não alarme. O que não pode acontecer é
  // countdown — e, passada a janela sem o resto da assinatura, volta a normal.
  assert.equal(r.estado, "normal", "seguiu andando: a anomalia isolada expira");
});

test("celular girado com a moto parada não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 6 }, () => ({ speedKmh: 0 })),
      { speedKmh: 0, gyroDegS: 400, accelMs2: 30 },
      ...Array.from({ length: 10 }, () => ({ speedKmh: 0 })),
    ]),
  );
  assert.equal(r.estado, "normal", "nunca esteve em movimento");
});

test("GPS ruim não decide nada", () => {
  // Velocidade despencando com precisão péssima: é o fix pulando, não freada.
  const r = rodar(
    serie([
      ...Array.from({ length: 8 }, () => ({ speedKmh: 40, accuracyM: 10 })),
      { speedKmh: 0, accuracyM: 400, accelMs2: 40 },
      { speedKmh: 41, accuracyM: 300 },
      ...Array.from({ length: 8 }, () => ({ speedKmh: 40, accuracyM: 10 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown");
});

test("túnel: perder o fix não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 8 }, () => ({ speedKmh: 45 })),
      ...Array.from({ length: 10 }, () => ({ speedKmh: null })),
      ...Array.from({ length: 8 }, () => ({ speedKmh: 45 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown", "sem velocidade não há queda de velocidade");
});

test("impacto sozinho, sem parar, não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 8 }, () => ({ speedKmh: 50 })),
      { speedKmh: 49, accelMs2: 45, gyroDegS: 500 },
      ...Array.from({ length: 24 }, () => ({ speedKmh: 48 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown", "impacto sem parada nunca alcança o alarme");
  assert.equal(r.estado, "normal", "e a anomalia isolada expira sozinha");
});

test("rotação sozinha, sem parar, não dispara", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 8 }, () => ({ speedKmh: 40 })),
      { speedKmh: 40, gyroDegS: 600 },
      ...Array.from({ length: 24 }, () => ({ speedKmh: 40 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown");
  assert.equal(r.estado, "normal", "a anomalia isolada expira sozinha");
});

/* ================================================================== *
 * A assinatura que interessa
 * ================================================================== */

/** Impacto + parada + imobilidade: a sequência de uma queda. */
function serieDeQueda(): AmostraSensor[] {
  return serie([
    ...Array.from({ length: 10 }, () => ({ speedKmh: 45 })),
    { speedKmh: 44, accelMs2: 48, gyroDegS: 520 },
    { speedKmh: 2 },
    ...Array.from({ length: 20 }, () => ({ speedKmh: 0, accelMs2: 0.2, gyroDegS: 1 })),
  ]);
}

test("impacto + queda de velocidade + imobilidade vira candidato a queda", () => {
  const r = rodar(serieDeQueda());
  assert.equal(r.estado, "countdown");
  assert.ok(r.sinais.includes("impacto"));
  assert.ok(r.sinais.includes("queda-de-velocidade"));
  assert.ok(r.sinais.includes("imobilidade"));
});

test("perder o GPS depois do impacto não confirma imobilidade", () => {
  const amostras = serieDeQueda();
  for (let i = 13; i < amostras.length; i++) amostras[i].speedKmh = null;
  assert.notEqual(rodar(amostras).estado, "countdown");
});

test("GPS impreciso depois do impacto não confirma imobilidade", () => {
  const amostras = serieDeQueda();
  for (let i = 13; i < amostras.length; i++) amostras[i].accuracyM = 400;
  assert.notEqual(rodar(amostras).estado, "countdown");
});

test("GPS que retorna minutos depois não ressuscita um impacto antigo", () => {
  const engine = new CrashDetectionEngine();
  engine.processarSerie(serieDeQueda().slice(0, 13));
  engine.processar({ t: 40_000, speedKmh: null, accuracyM: null, accelMs2: 0, gyroDegS: 0 });
  for (let t = 60_000; t <= 80_000; t += 500) {
    assert.equal(
      engine.processar({ t, speedKmh: 0, accuracyM: 10, accelMs2: 0, gyroDegS: 0 }).estado,
      "normal",
    );
  }
});

test("o retorno do GPS exige uma nova janela completa de imobilidade", () => {
  const engine = new CrashDetectionEngine();
  const amostras = serieDeQueda();
  for (let i = 13; i <= 20; i++) amostras[i].speedKmh = null;
  assert.notEqual(engine.processarSerie(amostras.slice(0, 25)).estado, "countdown");
  const ultimo = amostras[24];
  for (let i = 1; i <= 12; i++) engine.processar({ ...ultimo, t: ultimo.t + i * 500 });
  assert.equal(engine.processar({ ...ultimo, t: ultimo.t + 6500 }).estado, "countdown");
});

test("mesma assinatura, mas a pessoa volta a andar: sem alarme", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 10 }, () => ({ speedKmh: 45 })),
      { speedKmh: 44, accelMs2: 48, gyroDegS: 520 },
      { speedKmh: 2 },
      { speedKmh: 3 },
      { speedKmh: 20 },
      ...Array.from({ length: 10 }, () => ({ speedKmh: 40 })),
    ]),
  );
  assert.notEqual(r.estado, "countdown", "levantou e seguiu: não é emergência");
});

test("imobilidade curta demais ainda não confirma", () => {
  const r = rodar(
    serie([
      ...Array.from({ length: 10 }, () => ({ speedKmh: 45 })),
      { speedKmh: 44, accelMs2: 48, gyroDegS: 520 },
      { speedKmh: 1 },
      { speedKmh: 0 },
    ]),
  );
  assert.equal(r.estado, "candidate", "precisa de mais tempo parado");
});

test("nenhum sinal isolado alcança o countdown", () => {
  const isolados: AmostraSensor[][] = [
    serie([...Array.from({ length: 20 }, () => ({ speedKmh: 45, accelMs2: 60 }))]),
    serie([...Array.from({ length: 20 }, () => ({ speedKmh: 45, gyroDegS: 700 }))]),
    serie([...Array.from({ length: 20 }, () => ({ speedKmh: 0 }))]),
  ];
  for (const s of isolados) {
    assert.notEqual(rodar(s).estado, "countdown");
  }
});

/* ================================================================== *
 * Countdown e acionamento
 * ================================================================== */

test("o countdown conta 15 s e termina uma vez só", () => {
  assert.equal(segundosRestantes(0, 0), 15);
  assert.equal(segundosRestantes(0, 5_000), 10);
  assert.equal(segundosRestantes(0, 15_000), 0);
  assert.equal(segundosRestantes(0, 99_000), 0);
  assert.equal(countdownTerminou(0, 14_999), false);
  assert.equal(countdownTerminou(0, 15_000), true);
});

test("'estou bem' encerra sem SOS", () => {
  const e = new CrashDetectionEngine();
  e.processarSerie(serieDeQueda());
  assert.equal(e.estado, "countdown");
  const r = e.cancelar();
  assert.equal(r.estado, "cancelled");
  assert.equal(
    decidirAcionamento({
      deteccaoLigada: true,
      modoDiagnostico: false,
      sosAtivo: false,
      estado: r.estado,
    }).acionar,
    false,
  );
});

test("sem resposta, aciona exatamente um SOS pelo caminho manual", () => {
  const e = new CrashDetectionEngine();
  e.processarSerie(serieDeQueda());
  const r = e.confirmar();
  const d = decidirAcionamento({
    deteccaoLigada: true,
    modoDiagnostico: false,
    sosAtivo: false,
    estado: r.estado,
  });
  assert.equal(d.acionar, true);
  assert.equal(d.origem, "automatic_crash_detection");
});

test("com SOS já ativo, não abre um segundo", () => {
  const d = decidirAcionamento({
    deteccaoLigada: true,
    modoDiagnostico: false,
    sosAtivo: true,
    estado: "sos",
  });
  assert.equal(d.acionar, false);
  assert.match(d.motivo, /ja existe/i);
});

test("detecção desligada nunca aciona", () => {
  const d = decidirAcionamento({
    deteccaoLigada: false,
    modoDiagnostico: false,
    sosAtivo: false,
    estado: "sos",
  });
  assert.equal(d.acionar, false);
});

test("MODO DIAGNÓSTICO nunca aciona, em nenhuma combinação", () => {
  for (const deteccaoLigada of [true, false]) {
    for (const sosAtivo of [true, false]) {
      for (const estado of [
        "normal",
        "anomaly",
        "candidate",
        "countdown",
        "cancelled",
        "sos",
      ] as const) {
        const d = decidirAcionamento({ deteccaoLigada, modoDiagnostico: true, sosAtivo, estado });
        assert.equal(d.acionar, false, `diagnóstico acionou em ${estado}`);
        assert.equal(d.origem, null);
      }
    }
  }
});

test("depois de resolver, o motor volta ao zero", () => {
  const e = new CrashDetectionEngine();
  e.processarSerie(serieDeQueda());
  e.cancelar();
  e.reset();
  assert.equal(e.estado, "normal");
  const r = e.processarSerie(serie(Array.from({ length: 10 }, () => ({ speedKmh: 40 }))));
  assert.equal(r.estado, "normal", "não pode reacusar sozinho");
});

test("limiares são configuráveis sem tocar na lógica", () => {
  const rigido = new CrashDetectionEngine({ imobilidade: 60_000 });
  assert.equal(rigido.processarSerie(serieDeQueda()).estado, "candidate");
});
