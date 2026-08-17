import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (p: string) => readFileSync(p, "utf8");

/* ---------- comportamento da trilha ---------- */

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

(globalThis as Record<string, unknown>).window = {
  localStorage: new MemoryStorage(),
  location: { host: "moto-angel-guardian.lovable.app", pathname: "/auth/callback" },
};

const diag = await import("./auth-diagnostics.ts");

test("cada tentativa recebe um attempt_id novo e isolado", () => {
  const a = diag.iniciarTentativaDeAuth();
  diag.registrarEventoDeAuth("oauth.begin");
  const b = diag.iniciarTentativaDeAuth();
  assert.notEqual(a, b);
  assert.equal(diag.idDaTentativaDeAuth(), b);
  assert.equal(diag.trilhaDeAuth().length, 0, "trilha nova não herda eventos da anterior");
});

test("a trilha sobrevive à morte da WebView (localStorage)", () => {
  diag.iniciarTentativaDeAuth();
  diag.registrarEventoDeAuth("browser.open");
  const bruto = (globalThis as any).window.localStorage.getItem(diag.CHAVE_TRILHA_AUTH);
  assert.ok(bruto && bruto.includes("browser.open"), "evento não foi persistido");
});

test("presença de parâmetros é gravada como flag booleana, nunca o valor", () => {
  diag.iniciarTentativaDeAuth();
  diag.registrarEventoDeAuth("callback.web.query.presence", undefined, {
    flags: { state: true, code: true, error: false, sessao: false },
  });
  const texto = diag.diagnosticoDeAuthExportavel();
  assert.ok(texto.includes("state+code"));
  assert.ok(!texto.includes("false"));
});

test("detalhe sensível é sanitizado antes de virar diagnóstico", () => {
  assert.equal(diag.detalheSeguro("piloto@example.com"), "[email]");
  assert.equal(diag.detalheSeguro("https://oauth.lovable.app/callback?x=1"), "[url]");
  assert.equal(diag.detalheSeguro("a".repeat(64)), "[redacted]");
});

test("o export traz attempt_id, etapas e nenhum segredo", () => {
  diag.iniciarTentativaDeAuth();
  diag.registrarEventoDeAuth("deepLink.begin");
  const dados = JSON.parse(diag.diagnosticoDeAuthExportavel());
  assert.equal(dados.diagnostico, "MA-AUTH");
  assert.ok(dados.attempt_id);
  assert.equal(dados.eventos.at(-1).event, "deepLink.begin");
  assert.equal(dados.eventos.at(-1).stage, "deeplink");
});

/* ---------- instrumentação exigida no fluxo ---------- */

test("o callback registra entrada, presença de parâmetros e a volta por deep link", () => {
  const cb = ler("src/routes/auth.callback.tsx");
  for (const evento of [
    "callback.web.enter",
    "callback.web.query.presence",
    "callback.native.detected",
    "deepLink.begin",
    "deepLink.replace.called",
    "stash.fail",
    "dashboard.reached",
  ]) {
    assert.ok(cb.includes(evento), `callback não registra ${evento}`);
  }
  assert.ok(
    cb.indexOf("deepLink.begin") < cb.indexOf("window.location.replace"),
    "deepLink.begin precisa ser gravado ANTES do replace",
  );
});

test("o fluxo nativo abre uma tentativa e marca a detecção do APK", () => {
  const nativo = ler("src/lib/native-auth.ts");
  assert.ok(nativo.includes("iniciarTentativaDeAuth"));
  assert.ok(nativo.includes('registrarEventoDeAuth("native.detect"'));
  assert.ok(nativo.includes('registrarEventoDeAuth("dashboard.reached")'));
});

/* ---------- beacon server-side ---------- */

test("o beacon público aceita só metadados booleanos e códigos curtos", () => {
  const rota = ler("src/routes/api/public/auth-beacon.ts");
  for (const campo of ["has_state", "has_code", "has_error", "has_session_params", "native_flow"]) {
    assert.ok(rota.includes(campo), `beacon sem campo ${campo}`);
  }
  for (const campo of ["access_token", "refresh_token", "code_verifier", "email"]) {
    assert.ok(!rota.includes(campo), `beacon aceita campo sensível: ${campo}`);
  }
  assert.ok(rota.includes("z.object("), "payload do beacon precisa ser validado");
});

test("o beacon é enviado com keepalive e nunca derruba o login", () => {
  const cliente = ler("src/lib/auth-beacon.ts");
  assert.ok(cliente.includes("keepalive: true"));
  assert.ok(cliente.includes("catch"));
});

/* ---------- tela de diagnóstico ---------- */

test("existe tela para recuperar a trilha sem Android Studio", () => {
  const tela = ler("src/routes/oauth-debug.tsx");
  assert.ok(tela.includes("diagnosticoDeAuthExportavel"));
  assert.ok(tela.includes("clipboard"));
  assert.ok(ler("src/routes/login.tsx").includes("/oauth-debug"), "login sem acesso ao diagnóstico");
});
