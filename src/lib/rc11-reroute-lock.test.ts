import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avaliarDesvio,
  distanciaDaRota,
  DESVIO_INICIAL,
  COOLDOWN_MS,
  LEITURAS_PARA_DESVIO,
} from "./reroute.ts";

/**
 * RC11 — recálculo de rota por desvio + regressão da tela de bloqueio.
 *
 * Os testes de desvio são de comportamento REAL (números em metros). Os da
 * tela de bloqueio são estruturais: provam que as duas pontas (serviço e
 * Activity) leem a MESMA verdade — foi a divergência entre elas que apagou a
 * navegação no keyguard.
 */

const ROTA = [
  { lat: -23.5505, lng: -46.6333 },
  { lat: -23.5505, lng: -46.6293 },
  { lat: -23.5475, lng: -46.6293 },
];

describe("distância até a rota", () => {
  it("é ~0 em cima do traçado", () => {
    expect(distanciaDaRota({ lat: -23.5505, lng: -46.6313 }, ROTA)).toBeLessThan(5);
  });

  it("cresce ao sair do caminho", () => {
    const d = distanciaDaRota({ lat: -23.5525, lng: -46.6313 }, ROTA);
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(280);
  });

  it("sem traçado utilizável não existe desvio", () => {
    expect(distanciaDaRota({ lat: -23.55, lng: -46.63 }, [])).toBeNull();
    expect(distanciaDaRota(null, ROTA)).toBeNull();
  });
});

describe("decisão de recalcular", () => {
  const fora = { lat: -23.5525, lng: -46.6313 };

  it("não recalcula na primeira leitura fora", () => {
    const r = avaliarDesvio(DESVIO_INICIAL, { posicao: fora, tracado: ROTA, agoraMs: 1000 });
    expect(r.recalcular).toBe(false);
    expect(r.estado.leiturasFora).toBe(1);
  });

  it("recalcula após leituras consecutivas suficientes", () => {
    let estado = DESVIO_INICIAL;
    let recalculou = false;
    for (let i = 0; i < LEITURAS_PARA_DESVIO; i++) {
      const r = avaliarDesvio(estado, { posicao: fora, tracado: ROTA, agoraMs: 1000 + i * 1000 });
      estado = r.estado;
      recalculou = r.recalcular;
    }
    expect(recalculou).toBe(true);
  });

  it("voltar à rota zera o contador", () => {
    const um = avaliarDesvio(DESVIO_INICIAL, { posicao: fora, tracado: ROTA, agoraMs: 1000 });
    const dentro = avaliarDesvio(um.estado, {
      posicao: { lat: -23.5505, lng: -46.6313 },
      tracado: ROTA,
      agoraMs: 2000,
    });
    expect(dentro.estado.leiturasFora).toBe(0);
    expect(dentro.recalcular).toBe(false);
  });

  it("respeita o cooldown entre recálculos", () => {
    let estado = { leiturasFora: LEITURAS_PARA_DESVIO, ultimoRecalculoMs: 10_000 };
    const cedo = avaliarDesvio(estado, { posicao: fora, tracado: ROTA, agoraMs: 12_000 });
    expect(cedo.recalcular).toBe(false);
    estado = cedo.estado;
    const depois = avaliarDesvio(estado, {
      posicao: fora,
      tracado: ROTA,
      agoraMs: 10_000 + COOLDOWN_MS + 1,
    });
    expect(depois.recalcular).toBe(true);
  });

  it("ignora leitura de GPS imprecisa", () => {
    const r = avaliarDesvio(
      { leiturasFora: LEITURAS_PARA_DESVIO, ultimoRecalculoMs: 0 },
      { posicao: fora, tracado: ROTA, precisaoM: 300, agoraMs: 50_000 },
    );
    expect(r.recalcular).toBe(false);
  });
});

const estado = readFileSync(
  "android/app/src/main/java/com/motoanjo/app/LockNavigationState.java",
  "utf8",
);
const activity = readFileSync(
  "android/app/src/main/java/com/motoanjo/app/LockNavigationActivity.java",
  "utf8",
);
const servico = readFileSync(
  "android/app/src/main/java/com/motoanjo/app/ViagemSeguraService.java",
  "utf8",
);

describe("regressão da tela de bloqueio", () => {
  it("o serviço publica seu estado no espelho de bloqueio", () => {
    expect(servico).toContain("LockNavigationState.definirServicoAtivo(ativo)");
  });

  it("existe uma verdade única sobre viagem ativa", () => {
    expect(estado).toContain("public static boolean viagemAtivaAgora()");
    expect(estado).toContain("return servicoAtivo || atual.ativa;");
  });

  it("a Activity não se mata por quadro congelado da WebView", () => {
    expect(activity).toContain("LockNavigationState.viagemAtivaAgora()");
    expect(activity).not.toContain("!inicial.ativa");
  });

  it("quadro vazio com serviço em viagem não fecha a navegação", () => {
    expect(estado).toContain("if (!atual.ativa && !servicoAtivo) fechar();");
  });

  it("a posição do serviço continua movendo o marcador sem quadro novo", () => {
    expect(estado).toContain("if (!viagemAtivaAgora()) return;");
  });
});

describe("recálculo ligado ao mapa real", () => {
  const mapa = readFileSync("src/components/RealMap.tsx", "utf8");

  it("o mapa avalia desvio com o módulo puro", () => {
    expect(mapa).toContain("avaliarDesvio(desvioRef.current");
  });

  it("o recálculo reaproveita o MESMO pedido de rota", () => {
    expect(mapa).toContain("setTentativaRota((n) => n + 1)");
  });

  it("nenhum segundo GPS é criado para o recálculo", () => {
    expect(mapa).not.toContain("navigator.geolocation.watchPosition");
  });
});
