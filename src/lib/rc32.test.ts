import test from "node:test";
import assert from "node:assert/strict";
import { CAMADAS, camada, classesDeCamadaCompletas, type NomeDeCamada } from "./layers.ts";
import { abrirFolha, algumaFolhaAberta, fecharFolha, sosFlutuanteVisivel } from "./sheets.ts";
import { celulaDeBusca } from "./coords.ts";
import { passosDoEnquadramento } from "./navigation-cue.ts";
import { LIMITE_DE_PEDIDO_MS } from "./location-permission.ts";
import { readFileSync } from "node:fs";

/* ============================================================ *
 * #1 — camadas: as classes precisam EXISTIR no CSS gerado
 * ============================================================ */

test("camada() nunca devolve classe montada em tempo de execução", () => {
  // O bug era exatamente este: `z-[${n}]`. O Tailwind varre o TEXTO do
  // código; uma classe montada em runtime nunca é gerada, e a ordem visual
  // da Home volta a ser a ordem do DOM.
  for (const nome of Object.keys(CAMADAS) as NomeDeCamada[]) {
    assert.match(camada(nome), /^z-(\d+|\[\d+\])$/);
  }
});

test("toda camada declarada tem classe literal", () => {
  assert.equal(classesDeCamadaCompletas(), true);
});

test("painel de SOS acima do modal, modal acima do acionador flutuante", () => {
  assert.ok(CAMADAS.painelSos > CAMADAS.fundoModal);
  assert.ok(CAMADAS.fundoModal > CAMADAS.sos);
  assert.ok(CAMADAS.sos > CAMADAS.navegacao);
});

/* ============================================================ *
 * #4 — uma folha inferior por vez
 * ============================================================ */

test("abrir uma folha fecha a anterior", () => {
  assert.equal(abrirFolha("camadas", "destino"), "destino");
  assert.equal(abrirFolha("destino", "camadas"), "camadas");
});

test("tocar na mesma folha fecha", () => {
  assert.equal(abrirFolha("camadas", "camadas"), "nenhuma");
});

test("fechar volta ao estado neutro", () => {
  assert.equal(fecharFolha(), "nenhuma");
  assert.equal(algumaFolhaAberta("nenhuma"), false);
  assert.equal(algumaFolhaAberta("viagem"), true);
});

/* ============================================================ *
 * #3 — o SOS não cobre modal nem teclado
 * ============================================================ */

test("SOS flutuante aparece na Home limpa", () => {
  assert.equal(sosFlutuanteVisivel("nenhuma", false), true);
});

test("SOS flutuante some com qualquer folha aberta", () => {
  assert.equal(sosFlutuanteVisivel("destino", false), false);
  assert.equal(sosFlutuanteVisivel("camadas", false), false);
  assert.equal(sosFlutuanteVisivel("viagem", false), false);
});

test("SOS flutuante some com o teclado aberto", () => {
  assert.equal(sosFlutuanteVisivel("nenhuma", true), false);
});

/* ============================================================ *
 * #1 — a busca de apoio não pode seguir cada metro do GPS
 * ============================================================ */

test("célula de busca não muda com deslocamento de poucos metros", () => {
  assert.equal(celulaDeBusca(-23.55052, -46.633308), celulaDeBusca(-23.55061, -46.633401));
});

test("célula de busca muda ao sair da célula", () => {
  assert.notEqual(celulaDeBusca(-23.55052, -46.633308), celulaDeBusca(-23.58052, -46.633308));
});

test("célula de busca é estável e serializável", () => {
  assert.equal(celulaDeBusca(-23.55052, -46.633308), celulaDeBusca(-23.55052, -46.633308));
  assert.equal(typeof celulaDeBusca(0.1, 0.1), "string");
});

/* ============================================================ *
 * #10 — enquadramento: usuário + trecho relevante
 * ============================================================ */

test("sem passos, não enquadra nada", () => {
  assert.equal(passosDoEnquadramento([]), 0);
});

test("inclui pelo menos um passo, mesmo curto", () => {
  assert.equal(passosDoEnquadramento([80]), 1);
});

test("para de somar ao cobrir o limite", () => {
  assert.equal(passosDoEnquadramento([400, 400, 400, 400, 5000]), 4);
});

test("não enquadra a rota inteira quando ela é longa", () => {
  const passos = [300, 900, 600, 12000, 8000];
  assert.ok(passosDoEnquadramento(passos) < passos.length);
});

test("distâncias zeradas não quebram o enquadramento", () => {
  assert.equal(passosDoEnquadramento([0, 0, 0]), 3);
});

/* ============================================================ *
 * #2 — o pedido de permissão sempre termina
 * ============================================================ */

test("pedido de permissão tem limite finito acima do timeout do GPS", () => {
  assert.equal(Number.isFinite(LIMITE_DE_PEDIDO_MS), true);
  assert.ok(LIMITE_DE_PEDIDO_MS > 10000);
});

/* ============================================================ *
 * P0 — falhas do provedor do mapa não derrubam o cockpit
 * ============================================================ */

test("Home isola o mapa em um boundary próprio", () => {
  const dashboard = readFileSync(
    new URL("../routes/_authenticated/dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /<MapErrorBoundary>/);
  assert.match(dashboard, /<RealMap/);
});

test("recuperação do boundary raiz faz reload real", () => {
  const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /window\.location\.reload\(\)/);
  assert.match(root, /installGlobalErrorReporting/);
});
