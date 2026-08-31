import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  avaliarDesvio,
  distanciaDaRota,
  DESVIO_INICIAL,
  COOLDOWN_MS,
  LEITURAS_PARA_DESVIO,
} from "./reroute.ts";

/**
 * RC11 — recálculo automático de rota + regressão da tela de bloqueio.
 *
 * Os testes de desvio medem comportamento REAL, em metros. Os da tela de
 * bloqueio são estruturais: provam que serviço e Activity leem a MESMA
 * verdade sobre "há viagem" — foi a divergência entre as duas pontas que
 * apagou a navegação no keyguard depois do último release.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const JAVA = "android/app/src/main/java/com/motoanjo/app";

const ROTA = [
  { lat: -23.5505, lng: -46.6333 },
  { lat: -23.5505, lng: -46.6293 },
  { lat: -23.5475, lng: -46.6293 },
];
const FORA = { lat: -23.5525, lng: -46.6313 };

/* ================================================================== *
 * 1. Distância até a rota
 * ================================================================== */

test("em cima do traçado a distância é praticamente zero", () => {
  const d = distanciaDaRota({ lat: -23.5505, lng: -46.6313 }, ROTA);
  assert.ok(d != null && d < 5, `esperado < 5 m, veio ${d}`);
});

test("sair do caminho aumenta a distância", () => {
  const d = distanciaDaRota(FORA, ROTA);
  assert.ok(d != null && d > 180 && d < 300, `distância inesperada: ${d}`);
});

test("sem traçado utilizável não existe desvio", () => {
  assert.equal(distanciaDaRota({ lat: -23.55, lng: -46.63 }, []), null);
  assert.equal(distanciaDaRota(null, ROTA), null);
});

/* ================================================================== *
 * 2. Decisão de recalcular
 * ================================================================== */

test("uma leitura fora não recalcula", () => {
  const r = avaliarDesvio(DESVIO_INICIAL, { posicao: FORA, tracado: ROTA, agoraMs: 1000 });
  assert.equal(r.recalcular, false);
  assert.equal(r.estado.leiturasFora, 1);
});

test("leituras consecutivas suficientes confirmam o desvio", () => {
  let estado = DESVIO_INICIAL;
  let recalculou = false;
  for (let i = 0; i < LEITURAS_PARA_DESVIO; i++) {
    const r = avaliarDesvio(estado, { posicao: FORA, tracado: ROTA, agoraMs: 1000 + i * 1000 });
    estado = r.estado;
    recalculou = r.recalcular;
  }
  assert.equal(recalculou, true);
});

test("voltar à rota zera o contador", () => {
  const um = avaliarDesvio(DESVIO_INICIAL, { posicao: FORA, tracado: ROTA, agoraMs: 1000 });
  const dentro = avaliarDesvio(um.estado, {
    posicao: { lat: -23.5505, lng: -46.6313 },
    tracado: ROTA,
    agoraMs: 2000,
  });
  assert.equal(dentro.estado.leiturasFora, 0);
  assert.equal(dentro.recalcular, false);
});

test("cooldown impede rajada de recálculos", () => {
  const inicial = { leiturasFora: LEITURAS_PARA_DESVIO, ultimoRecalculoMs: 10_000 };
  const cedo = avaliarDesvio(inicial, { posicao: FORA, tracado: ROTA, agoraMs: 12_000 });
  assert.equal(cedo.recalcular, false);
  const depois = avaliarDesvio(cedo.estado, {
    posicao: FORA,
    tracado: ROTA,
    agoraMs: 10_000 + COOLDOWN_MS + 1,
  });
  assert.equal(depois.recalcular, true);
});

test("leitura de GPS imprecisa não prova desvio", () => {
  const r = avaliarDesvio(
    { leiturasFora: LEITURAS_PARA_DESVIO, ultimoRecalculoMs: 0 },
    { posicao: FORA, tracado: ROTA, precisaoM: 300, agoraMs: 50_000 },
  );
  assert.equal(r.recalcular, false);
});

/* ================================================================== *
 * 3. Regressão da tela de bloqueio
 * ================================================================== */

test("o serviço publica seu estado no espelho de bloqueio", () => {
  assert.match(
    ler(`${JAVA}/ViagemSeguraService.java`),
    /LockNavigationState\.definirServicoAtivo\(ativo\)/,
  );
});

test("existe uma verdade única sobre viagem ativa", () => {
  const estado = ler(`${JAVA}/LockNavigationState.java`);
  assert.match(estado, /public static boolean viagemAtivaAgora\(\)/);
  assert.match(estado, /return servicoAtivo \|\| atual\.ativa;/);
});

test("a Activity não se mata por quadro congelado da WebView", () => {
  const activity = ler(`${JAVA}/LockNavigationActivity.java`);
  assert.match(activity, /LockNavigationState\.viagemAtivaAgora\(\)/);
  assert.ok(!activity.includes("!inicial.ativa"), "gate antigo do quadro ainda presente");
});

test("quadro vazio com serviço em viagem não fecha a navegação", () => {
  assert.match(
    ler(`${JAVA}/LockNavigationState.java`),
    /if \(!atual\.ativa && !servicoAtivo\) fechar\(\);/,
  );
});

test("a posição do serviço move o marcador mesmo sem quadro novo", () => {
  assert.match(ler(`${JAVA}/LockNavigationState.java`), /if \(!viagemAtivaAgora\(\)\) return;/);
});

/* ================================================================== *
 * 4. Ligação com o mapa real
 * ================================================================== */

test("o mapa avalia desvio com o módulo puro", () => {
  assert.match(ler("src/components/RealMap.tsx"), /avaliarDesvio\(desvioRef\.current/);
});

test("o recálculo reaproveita o MESMO pedido de rota", () => {
  assert.match(ler("src/components/RealMap.tsx"), /setTentativaRota\(\(n\) => n \+ 1\)/);
});

test("nenhum segundo GPS é criado para o recálculo", () => {
  assert.ok(!ler("src/components/RealMap.tsx").includes("navigator.geolocation.watchPosition"));
});
