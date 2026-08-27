/**
 * P0 — "a sessão ficava presa no Custom Tab".
 *
 * O reconhecimento do retorno nativo dependia só do `state` ecoado pelo
 * broker. Sem eco, a página de callback seguia o caminho de navegador e o
 * supabase-js criava a sessão DENTRO do Chrome; o APK continuava deslogado.
 * Estes testes prendem o contrato novo: marcador no caminho, `state`
 * reconstruído no deep link e fechamento explícito do Custom Tab.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  caminhoDeCallbackNativo,
  lerMarcadorNativo,
  montarEstadoNativo,
  SEGMENTO_CALLBACK_NATIVO,
  validarEstadoDeRetorno,
} from "./oauth-state.ts";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const NONCE = "n".repeat(32);
const CHALLENGE = "c".repeat(43);

test("o marcador viaja no caminho, sem query e sem segredo", () => {
  const url = caminhoDeCallbackNativo("https://moto.app", NONCE, CHALLENGE);
  assert.equal(url, `https://moto.app/auth/callback/n/ma1.${NONCE}.${CHALLENGE}`);
  assert.ok(!url.includes("?") && !url.includes("&"));
  assert.equal(SEGMENTO_CALLBACK_NATIVO, "n");
});

test("o marcador do caminho devolve nonce e desafio PKCE", () => {
  const lido = lerMarcadorNativo(`ma1.${NONCE}.${CHALLENGE}`);
  assert.equal(lido?.nonce, NONCE);
  assert.equal(lido?.challenge, CHALLENGE);
  assert.equal(lerMarcadorNativo(undefined), null);
  assert.equal(lerMarcadorNativo("lixo"), null);
});

test("state reconstruído a partir do caminho ainda valida contra a pendência", () => {
  const reconstruido = montarEstadoNativo(NONCE, CHALLENGE);
  assert.deepEqual(validarEstadoDeRetorno(reconstruido, { nonce: NONCE, criadoEm: 1_000 }, 2_000), {
    ok: true,
  });
});

test("existe rota de callback nativo com o marcador no caminho", () => {
  const rota = ler("src/routes/auth.callback.n.$marcador.tsx");
  assert.ok(rota.includes('createFileRoute("/auth/callback/n/$marcador")'));
  assert.ok(rota.includes("marcadorDaRota={marcador}"));
});

test("a tela de callback prefere o marcador do caminho ao state do broker", () => {
  const tela = ler("src/components/AuthCallbackScreen.tsx");
  assert.ok(tela.includes("lerMarcadorNativo(marcadorDaRota)"));
  assert.ok(tela.includes("doMarcador ?? doState"));
});

test("o app aplica a sessão e fecha o Custom Tab após a troca", () => {
  const nativo = ler("src/lib/native-auth.ts");
  assert.ok(nativo.includes("exchangeNativeCode("));
  assert.ok(nativo.includes("supabase.auth.setSession(exchanged)"));
  assert.ok(nativo.includes("Browser.close()"));
  assert.ok(nativo.includes('window.location.replace("/dashboard")'));
  assert.ok(nativo.includes("App.getLaunchUrl()"), "cold start processa o deep link");
});

test("nenhum token viaja pelo deep link", () => {
  const tela = ler("src/components/AuthCallbackScreen.tsx");
  const trecho = tela.slice(tela.indexOf("const back ="), tela.indexOf("if (parsed.error)"));
  assert.ok(!trecho.includes("access_token") && !trecho.includes("refresh_token"));
});
