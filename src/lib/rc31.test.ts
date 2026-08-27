import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { distanciaDaManobra, setaDaManobra, viaDaInstrucao } from "./navigation-cue.ts";

const raiz = join(import.meta.dirname, "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/* ---------- Próxima manobra ---------- */

test("seta da manobra cobre os códigos do Google", () => {
  assert.equal(setaDaManobra("turn-left"), "esquerda");
  assert.equal(setaDaManobra("turn-slight-right"), "direita");
  assert.equal(setaDaManobra("uturn-left"), "retorno");
  assert.equal(setaDaManobra("roundabout-right"), "rotatoria");
  assert.equal(setaDaManobra(null), "frente");
});

test("distância da manobra nunca inventa número", () => {
  assert.equal(distanciaDaManobra(null), null);
  assert.equal(distanciaDaManobra(undefined), null);
  assert.equal(distanciaDaManobra(Number.NaN), null);
  assert.equal(distanciaDaManobra(184), "180 m");
  assert.equal(distanciaDaManobra(1240), "1,2 km");
});

test("a instrução vira só o nome da via", () => {
  assert.equal(viaDaInstrucao("Vire à esquerda na R. da Consolação"), "R. da Consolação");
  assert.equal(viaDaInstrucao(null), null);
  assert.equal(viaDaInstrucao("   "), null);
});

/* ---------- Telemetria compacta ---------- */

test("telemetria é uma faixa compacta, sem régua nem número gigante", () => {
  const strip = ler("components/TelemetryStrip.tsx");
  assert.match(strip, /data-testid="telemetria-compacta"/);
  assert.ok(!/text-\[56px\]/.test(strip), "sem número gigante de velocidade");
  const cockpit = ler("components/RideCockpit.tsx");
  assert.ok(!/posicaoNaRegua/.test(cockpit), "a régua de inclinação foi removida");
  assert.match(cockpit, /TelemetryStrip/);
});

test("sem dado, a telemetria mostra traço em vez de zero", () => {
  const strip = ler("components/TelemetryStrip.tsx");
  assert.match(strip, /velocidade == null \? "—"/);
  // V3: a inclinação saiu da faixa visível e virou contexto de leitor de tela;
  // a regra continua a mesma — sem sensor, nada de número fabricado.
  assert.match(strip, /graus == null \? "inclinação indisponível"/);
});


/* ---------- Copiloto ---------- */

test("copiloto é uma barra compacta de altura fixa", () => {
  const copiloto = ler("components/CopilotCard.tsx");
  assert.match(copiloto, /data-testid="copiloto-compacto"/);
  assert.match(copiloto, /h-9/);
});

/* ---------- Mapa e rota ---------- */

test("o mapa continua medindo área antes de nascer e não fica em loading eterno", () => {
  const mapa = ler("components/RealMap.tsx");
  assert.match(mapa, /ResizeObserver/);
  assert.match(mapa, /hasArea !== true/);
  assert.match(mapa, /setState\("error"\)/);
  assert.match(mapa, /Tentar novamente/);
});

test("distância e ETA vêm do Google, nunca de estimativa local", () => {
  const mapa = ler("components/RealMap.tsx");
  // A rota vem da Routes API pelo servidor (a chave de navegador não autoriza
  // Directions), mas continua sendo medida REAL do Google — nunca estimativa.
  assert.match(mapa, /rota\.distanciaM \/ 1000/);
  assert.match(mapa, /Math\.round\(rota\.duracaoS \/ 60\)/);
  assert.match(mapa, /proximaDistanciaM: passo\?\.distanciaM \?\? null/);
  const barra = ler("components/DestinationBar.tsx");
  assert.match(barra, /rota \?/);
});

test("a Home dá altura real ao mapa", () => {
  const home = ler("routes/_authenticated/dashboard.tsx");
  assert.match(home, /h-\[100dvh\]/);
  assert.match(home, /className="absolute inset-0"/);
});

/* ---------- Anjos e SOS ---------- */

test("anjos só aparecem com a camada de comunidade ligada", () => {
  const home = ler("routes/_authenticated/dashboard.tsx");
  assert.match(home, /camadas\.comunidade/);
  assert.match(home, /desativado/);
});

test("SOS continua na Home, acima da navegação e com safe-area", () => {
  const home = ler("routes/_authenticated/dashboard.tsx");
  // RC3.2: a Home passou a usar `SosFabControlado`, porque ela já tem o
  // controlador de SOS e instanciar um segundo abria dois canais de tempo
  // real para o mesmo evento. O que continua obrigatório é o acionador estar
  // na Home, com safe-area e acima da navegação.
  assert.match(home, /<SosFabControlado\b/);
  const fab = ler("components/SosFab.tsx");
  // RC4: a safe-area passou a viver no token --ma-bottom
  // (env(safe-area-inset-bottom) + altura da navegação), definido em styles.css.
  assert.match(fab, /var\(--ma-bottom\)|env\(safe-area-inset-bottom\)/);
  assert.match(fab, /z-50/);
});

test("os painéis inferiores não invadem a faixa do SOS", () => {
  const cockpit = ler("components/RideCockpit.tsx");
  const home = ler("routes/_authenticated/dashboard.tsx");
  for (const fonte of [cockpit, home]) {
    for (const [, valor] of fonte.matchAll(/--ma-bottom\)\+(\d+)px/g)) {
      const px = Number(valor);
      // Até 8px é a faixa lateral de resumo (pílulas nas bordas, o SOS fica
      // no centro). Qualquer painel de largura cheia começa acima de 86px.
      assert.ok(px <= 8 || px >= 86, `painel a ${valor}px colide com o SOS`);
    }
  }
});
