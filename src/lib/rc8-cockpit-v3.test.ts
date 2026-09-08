import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  centroAcimaDoUsuario,
  deslocamentoDaCamera,
  precisaMoverCamera,
  FRACAO_DO_USUARIO,
} from "./nav-camera.ts";
import { instrucaoDaManobra, acaoDaManobra } from "./navigation-cue.ts";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/* ================================================================== *
 * Câmera de navegação
 * ================================================================== */

test("o usuário fica no terço inferior, nunca no centro", () => {
  assert.ok(FRACAO_DO_USUARIO > 0.5 && FRACAO_DO_USUARIO <= 0.75);
  assert.ok(deslocamentoDaCamera(800) > 0);
  assert.equal(deslocamentoDaCamera(0), 0);
  assert.equal(deslocamentoDaCamera(Number.NaN), 0);
});

test("a fração é limitada: nunca joga o usuário para fora da tela", () => {
  assert.equal(deslocamentoDaCamera(1000, 0.1), 1000 * (0.5 - 0.5));
  assert.ok(deslocamentoDaCamera(1000, 5) <= 1000 * 0.4);
});

test("o centro da câmera vai para o norte do motociclista", () => {
  const alvo = { lat: -23.55, lng: -46.63 };
  const centro = centroAcimaDoUsuario(alvo, 17, deslocamentoDaCamera(800));
  assert.ok(centro.lat > alvo.lat, "centro deve ficar acima (norte) do usuário");
  assert.equal(centro.lng, alvo.lng, "longitude não muda");
});

test("sem deslocamento a câmera é o próprio alvo", () => {
  const alvo = { lat: 10, lng: 20 };
  assert.deepEqual(centroAcimaDoUsuario(alvo, 16, 0), alvo);
  assert.deepEqual(centroAcimaDoUsuario(alvo, Number.NaN, 40), alvo);
});

test("mais zoom desloca menos em graus — a câmera não salta", () => {
  const alvo = { lat: -23.55, lng: -46.63 };
  const perto = centroAcimaDoUsuario(alvo, 18, 200).lat - alvo.lat;
  const longe = centroAcimaDoUsuario(alvo, 14, 200).lat - alvo.lat;
  assert.ok(longe > perto);
});

test("câmera só se move quando a posição realmente mudou", () => {
  const a = { lat: -23.55, lng: -46.63 };
  assert.equal(precisaMoverCamera(null, a), true);
  assert.equal(precisaMoverCamera(a, { ...a }), false);
  assert.equal(precisaMoverCamera(a, { lat: a.lat + 0.001, lng: a.lng }), true);
});

/* ================================================================== *
 * Próxima manobra
 * ================================================================== */

test("o código do Google manda na ação exibida", () => {
  assert.equal(instrucaoDaManobra("turn-left", "qualquer coisa"), "Vire à esquerda");
  assert.equal(instrucaoDaManobra("roundabout-right", null), "Entre na rotatória");
  assert.equal(instrucaoDaManobra("uturn-left"), "Faça o retorno");
});

test("sem código conhecido, o fallback lê a instrução real — nunca inventa lado", () => {
  assert.equal(instrucaoDaManobra(null, "Vire à direita na Av. Paulista"), "Vire à direita");
  assert.equal(instrucaoDaManobra(null, "Siga em frente por 300 m"), "Siga em frente");
  assert.equal(instrucaoDaManobra(null, "Texto sem verbo algum"), "Continue");
  assert.equal(instrucaoDaManobra(null, null), "Continue");
  assert.equal(acaoDaManobra(null), null, "acaoDaManobra segue estrita");
});

/* ================================================================== *
 * Cockpit — contrato visual
 * ================================================================== */

test("a próxima manobra mantém a hierarquia distância > ação > rua", () => {
  const src = ler("src/components/NextManeuver.tsx");
  assert.match(src, /text-\[38px\][^"]*font-black/, "distância enorme");
  assert.match(src, /instrucaoDaManobra/, "ação vem do helper com fallback seguro");
  assert.match(src, /data-testid="proxima-manobra"/);
});

test("a telemetria mostra só velocidade, restante e chegada", () => {
  const src = ler("src/components/TelemetryStrip.tsx");
  assert.match(src, /rotulo="km\/h"/);
  assert.match(src, /rotulo="restante"/);
  assert.match(src, /rotulo="chegada"/);
  assert.match(src, /valor=\{velocidade == null \? "—"/, 'sem GPS mostra "—"');
  assert.match(src, /aria-label="Finalizar viagem"/);
});

test("o mapa recebe o modo de navegação e usa a câmera pura", () => {
  const mapa = ler("src/components/RealMap.tsx");
  assert.match(mapa, /navegando = false/);
  assert.match(mapa, /centroAcimaDoUsuario\(\s*center,\s*zoomAtual,\s*deslocamentoDaCamera/);
  assert.match(mapa, /precisaMoverCamera\(ultimoCentroRef\.current, alvo\)/);
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /navegando=\{modoCockpit\}/);
});

test("SOS e viagem seguem intocados na Home", () => {
  const home = ler("src/routes/_authenticated/dashboard.tsx");
  assert.match(home, /<SosFabControlado/);
  assert.match(home, /onFinalizar=\{\(\) => finalizar\(sosAtivo\)\}/);
});

test("câmera olha à frente ao navegar para leste, sul e oeste", () => {
  const origem = { lat: -23.55, lng: -46.63 };
  const leste = centroAcimaDoUsuario(origem, 17, 150, 90);
  const sul = centroAcimaDoUsuario(origem, 17, 150, 180);
  const oeste = centroAcimaDoUsuario(origem, 17, 150, 270);
  assert.ok(leste.lng > origem.lng);
  assert.ok(Math.abs(leste.lat - origem.lat) < 1e-9);
  assert.ok(sul.lat < origem.lat);
  assert.ok(Math.abs(sul.lng - origem.lng) < 1e-9);
  assert.ok(oeste.lng < origem.lng);
});

test("câmera cruza o antimeridiano sem produzir longitude inválida", () => {
  const centro = centroAcimaDoUsuario({ lat: 0, lng: 179.9999 }, 10, 150, 90);
  assert.ok(centro.lng >= -180 && centro.lng <= 180);
  assert.ok(centro.lng < 0);
});
