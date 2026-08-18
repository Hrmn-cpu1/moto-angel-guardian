import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (p: string) => readFileSync(p, "utf8");

/**
 * P0 — "Entrar com Google" terminava em MA-TRIP-001.
 *
 * Causa provada no bundle publicado: `VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_PUBLISHABLE_KEY` não existiam em tempo de build, então o
 * cliente do backend lançava "Missing Supabase environment variable(s)" no
 * primeiro acesso — e o boundary raiz mostrava MA-TRIP-001, escondendo a
 * mensagem real. Estes testes travam a configuração e a observabilidade.
 */

test("o contrato de configuração pública do backend está documentado para o build", () => {
  const env = ler(".env.example");
  for (const chave of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    const linha = env.split("\n").find((l) => l.startsWith(`${chave}=`));
    assert.ok(linha, `${chave} ausente do contrato de build`);
    assert.ok((linha.split("=")[1] ?? "").trim().length > 8, `${chave} sem exemplo válido`);
  }
});

test("a configuração de serviço nunca usa prefixo público", () => {
  const env = ler(".env.example");
  assert.ok(!env.includes("VITE_SUPABASE_SERVICE_ROLE"), "service_role jamais no ambiente do cliente");
});

test("o diagnóstico registra presença da configuração, sem expor valores", () => {
  const src = ler("src/lib/trip-diagnostics.ts");
  assert.match(src, /supabaseUrl: Boolean\(/);
  assert.match(src, /supabaseKey: Boolean\(/);
  assert.ok(
    !/config:\s*\{[^}]*import\.meta\.env\.VITE_SUPABASE_URL\s*[,}]/.test(src),
    "o valor da URL não pode entrar no diagnóstico",
  );
});

test("o diagnóstico distingue APK de navegador e anexa a trilha MA-AUTH", () => {
  const src = ler("src/lib/trip-diagnostics.ts");
  assert.match(src, /native: isNativeApp\(\)/);
  assert.match(src, /authTrail/);
  const server = ler("src/lib/trip-diagnostics.server.ts");
  for (const campo of ["config", "native", "authTrail"]) {
    assert.ok(server.includes(campo), `${campo} seria descartado pela validação do servidor`);
  }
});

test("o callback nativo continua idempotente e fecha em falha controlada", () => {
  const src = ler("src/lib/native-auth.ts");
  assert.match(
    src,
    /processedCallbacks\.has\(callbackKey\)/,
    "callback duplicado deve ser ignorado",
  );
  assert.match(src, /callbackJobs\.get\(callbackKey\)/, "callback concorrente deve reusar o job");
  assert.match(src, /getLaunchUrl/, "cold start pelo deep link precisa ser tratado");
  assert.match(src, /if \(!isNativeCallback\(callbackUrl\)\) return false/);
});

test("deep link inválido não derruba o app", () => {
  const src = ler("src/lib/native-auth.ts");
  assert.match(src, /export function parseAuthCallback/);
  // URL malformada precisa virar retorno vazio, nunca exceção no boundary raiz.
  assert.match(src, /try \{[\s\S]*new URL\(/, "parse de URL precisa estar protegido");
});

test("a autenticação não inicializa a Viagem Segura", () => {
  const src = ler("src/lib/native-auth.ts");
  assert.ok(!/trip-service|useTrip|iniciarViagem/i.test(src), "login não pode tocar na viagem");
});
