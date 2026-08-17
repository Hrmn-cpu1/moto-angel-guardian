import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  lerEstadoNativo,
  montarEstadoNativo,
  validarEstadoDeRetorno,
  VALIDADE_ESTADO_MS,
} from "./oauth-state.ts";
import {
  acrescentar,
  lerSessao,
  MAX_EVENTOS_TRILHA,
  novaSessao,
  resumirTrilha,
  sessaoAnteriorInacabada,
  TTL_TRILHA_MS,
} from "./trip-trail.ts";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/* ================================================================== *
 * P0.1 — contrato do broker OAuth
 * ================================================================== */

const NATIVE_AUTH = ler("src/lib/native-auth.ts");

test("redirect_uri nativo é caminho limpo, sem query", () => {
  assert.ok(NATIVE_AUTH.includes("const redirectUri = `${origin}/auth/callback`;"));
  assert.ok(!NATIVE_AUTH.includes("native=1&cc="), "query no redirect_uri foi removida");
});

test("a URL do broker manda só provider, redirect_uri e state", () => {
  const trecho = NATIVE_AUTH.slice(NATIVE_AUTH.indexOf("~oauth/initiate"));
  const url = trecho.slice(0, trecho.indexOf("`;"));
  for (const proibido of ["cc=", "native=", "response_mode"]) {
    assert.ok(!url.includes(proibido), `parâmetro fora do contrato: ${proibido}`);
  }
  assert.ok(url.includes("provider=google") && url.includes("redirect_uri=") && url.includes("state="));
});

/* ================================================================== *
 * P0.2 — state é validado na volta
 * ================================================================== */

const CHALLENGE = "a".repeat(43);

test("state nativo transporta o desafio PKCE e volta legível", () => {
  const state = montarEstadoNativo("n".repeat(32), CHALLENGE);
  const lido = lerEstadoNativo(state);
  assert.equal(lido?.challenge, CHALLENGE);
  assert.equal(lido?.nonce, "n".repeat(32));
});

test("state estranho não é aceito como nativo", () => {
  for (const ruim of [null, "", "abc", "ma2.x.y", "ma1..y", `ma1.${"n".repeat(32)}.curto`]) {
    assert.equal(lerEstadoNativo(ruim), null, String(ruim));
  }
});

test("validação de state falha fechada nos quatro casos", () => {
  const nonce = "n".repeat(32);
  const pend = { nonce, criadoEm: 1_000 };
  assert.deepEqual(validarEstadoDeRetorno(null, pend, 1_000), { ok: false, falha: "ausente" });
  assert.deepEqual(validarEstadoDeRetorno(montarEstadoNativo(nonce, CHALLENGE), null, 1_000), {
    ok: false,
    falha: "sem_pendencia",
  });
  assert.deepEqual(
    validarEstadoDeRetorno(montarEstadoNativo(nonce, CHALLENGE), pend, 1_000 + VALIDADE_ESTADO_MS + 1),
    { ok: false, falha: "expirado" },
  );
  assert.deepEqual(
    validarEstadoDeRetorno(montarEstadoNativo("z".repeat(32), CHALLENGE), pend, 1_000),
    { ok: false, falha: "divergente" },
  );
  assert.deepEqual(validarEstadoDeRetorno(montarEstadoNativo(nonce, CHALLENGE), pend, 2_000), {
    ok: true,
  });
});

test("o deep link é recusado quando o state não confere", () => {
  assert.ok(NATIVE_AUTH.includes("validarEstadoDeRetorno("));
  assert.ok(NATIVE_AUTH.includes('registrarEventoDeAuth("state.invalid"'));
});

test("o state segue no deep link de volta para o app", () => {
  const CALLBACK = ler("src/routes/auth.callback.tsx");
  assert.ok(CALLBACK.includes("...(state ? { state } : {})"));
  assert.ok(CALLBACK.includes("lerEstadoNativo(state)"));
});

/* ================================================================== *
 * P0.3 — trilha durável
 * ================================================================== */

test("trilha poda no limite e mantém os eventos mais recentes", () => {
  let s = novaSessao("s1", 0);
  for (let i = 0; i < MAX_EVENTOS_TRILHA + 10; i++) s = acrescentar(s, { e: `e${i}`, t: i });
  assert.equal(s.eventos.length, MAX_EVENTOS_TRILHA);
  assert.equal(s.eventos.at(-1)?.e, `e${MAX_EVENTOS_TRILHA + 9}`);
});

test("trilha vencida ou de outra versão é descartada", () => {
  const s = acrescentar(novaSessao("s1", 0), { e: "a", t: 0 });
  assert.equal(lerSessao(JSON.stringify(s), TTL_TRILHA_MS + 1), null);
  assert.equal(lerSessao(JSON.stringify({ ...s, v: 99 }), 0), null);
  assert.equal(lerSessao("{{ não é json", 0), null);
  assert.ok(lerSessao(JSON.stringify(s), 1_000));
});

test("sessão anterior só é 'inacabada' com prova", () => {
  const comEventos = acrescentar(novaSessao("antiga", 0), { e: "trip.start.request", t: 1 });
  assert.equal(sessaoAnteriorInacabada(comEventos, "atual"), true);
  assert.equal(sessaoAnteriorInacabada({ ...comEventos, finished: true }, "atual"), false);
  assert.equal(sessaoAnteriorInacabada(comEventos, "antiga"), false);
  assert.equal(sessaoAnteriorInacabada(null, "atual"), false);
  assert.equal(sessaoAnteriorInacabada(novaSessao("antiga", 0), "atual"), false);
});

test("resumo da trilha é compacto e sem dado pessoal", () => {
  const s = acrescentar(novaSessao("s", 0), { e: "map.error", t: 1, d: "REQUEST_DENIED" });
  assert.equal(resumirTrilha(s), "map.error:REQUEST_DENIED");
  assert.ok(resumirTrilha(s, 5).length <= 5);
});

test("a viagem grava pulso e marca o fim limpo", () => {
  const HOOK = ler("src/hooks/useTrip.ts");
  assert.ok(HOOK.includes('registrarEventoDeViagem("trip.heartbeat")'));
  assert.ok(HOOK.includes("marcarSessaoFinalizada()"));
  assert.ok(HOOK.includes('registrarEventoDeViagem("app.boot")'));
});

test("a trilha do MA-TRIP sobrevive à morte da WebView", () => {
  const DIAG = ler("src/lib/trip-diagnostics.ts");
  assert.ok(DIAG.includes("localStorage"), "trilha precisa de armazenamento durável");
  assert.ok(DIAG.includes("CHAVE_TRILHA_MA_TRIP"));
});

/* ================================================================== *
 * P1 — uma única Viagem Segura, e referências estáveis no mapa
 * ================================================================== */

test("a rota /trip não tem mais implementação paralela", () => {
  const TRIP = ler("src/routes/_authenticated/trip.tsx");
  assert.ok(TRIP.includes("redirect({ to: \"/dashboard\""));
  for (const proibido of ["useRideTelemetry", "useGeolocation", "setPhase"]) {
    assert.ok(!TRIP.includes(proibido), `estado paralelo remanescente: ${proibido}`);
  }
});

test("hooks do mapa não criam array novo a cada render", () => {
  for (const arquivo of [
    "src/hooks/usePartners.ts",
    "src/hooks/useRiskZones.ts",
    "src/hooks/useAlerts.ts",
    "src/hooks/useOnlineRiders.ts",
  ]) {
    const fonte = ler(arquivo);
    assert.ok(fonte.includes("VAZIO"), `${arquivo} ainda devolve [] literal`);
    const retorno = fonte.slice(fonte.lastIndexOf("return {"));
    assert.ok(!/\?\?\s*\[\]/.test(retorno), `${arquivo} ainda devolve ?? [] ao componente`);
  }
});

/* ================================================================== *
 * Segurança da instrumentação
 * ================================================================== */

test("MA-AUTH nunca registra token, verifier ou e-mail", () => {
  const AUTH = ler("src/lib/auth-diagnostics.ts");
  assert.ok(AUTH.includes("[redacted]") && AUTH.includes("[email]") && AUTH.includes("[url]"));
  for (const proibido of ["access_token", "refresh_token", "code_verifier"]) {
    assert.ok(!AUTH.includes(proibido), `campo sensível citado: ${proibido}`);
  }
});
