import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/* ================================================================== *
 * RC9 — Navigation Experience
 *
 * Contratos ESTRUTURAIS do fluxo destino -> prévia -> navegação. Não
 * substituem teste em aparelho: garantem apenas que a experiência não
 * regride para informação duplicada, estado mudo ou dado inventado.
 * ================================================================== */

test("o mapa informa o estado real do cálculo da rota", () => {
  const mapa = ler("src/components/RealMap.tsx");
  assert.match(mapa, /export type EstadoDaRota/);
  assert.match(mapa, /onRouteStatusRef\.current\?\.\("calculando"\)/);
  assert.match(mapa, /onRouteStatusRef\.current\?\.\("pronta"\)/);
  assert.match(mapa, /onRouteStatusRef\.current\?\.\("indisponivel"\)/);
});

test("o enquadramento respeita os painéis e muda entre prévia e navegação", () => {
  const mapa = ler("src/components/RealMap.tsx");
  assert.match(mapa, /paddingInferiorRef/);
  assert.match(mapa, /navegandoRef\.current/);
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /paddingInferiorPx=\{/);
});

test("a prévia mostra ETA e distância REAIS, nunca estimadas", () => {
  const cockpit = ler("src/components/RideCockpit.tsx");
  assert.match(cockpit, /data-testid="previa-da-rota"/);
  assert.match(cockpit, /rota\.duracaoMin/);
  assert.match(cockpit, /rota\.distanciaKm/);
  // Sem rota, estado honesto — e nenhum número no lugar.
  assert.match(cockpit, /data-testid="estado-da-rota"/);
  assert.match(cockpit, /Calculando a melhor rota/);
});

test("existe UM único CTA de iniciar viagem segura", () => {
  const cockpit = ler("src/components/RideCockpit.tsx");
  const ctas = cockpit.match(/Iniciar viagem segura/g) ?? [];
  // Um na prévia (CTA dourado) e um na chamada inicial (estado ocioso).
  assert.equal(ctas.length, 2);
  const barra = ler("src/components/DestinationBar.tsx");
  assert.ok(!/Iniciar viagem/.test(barra), "a faixa de destino não repete o CTA");
});

test("a faixa de destino não duplica a prévia durante a preparação", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /viagem\.estado !== "preparando" &&[\s\S]{0,120}<DestinationBar/);
});

test("o copiloto vira uma linha dentro da telemetria durante a navegação", () => {
  const strip = ler("src/components/TelemetryStrip.tsx");
  assert.match(strip, /data-testid="copiloto-na-faixa"/);
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /copiloto=\{textoDoCopiloto\}/);
  // O texto só nasce de evento real ou do silêncio.
  assert.match(home, /aviso\s*\?\s*`\$\{APARENCIA\[aviso\.categoria\]\.rotulo\}/);
});

test("sem passo conhecido a manobra é honesta em vez de inventar lado", () => {
  const src = ler("src/components/NextManeuver.tsx");
  assert.match(src, /"Siga a rota"/);
  assert.match(src, /if \(!via && !distancia && !rota\) return null;/);
});
