/**
 * Tradução de erros do Supabase Auth para mensagens distintas em português.
 *
 * O aparelho real mostrava "E-mail ou senha inválidos." para qualquer falha —
 * inclusive para conta ainda não confirmada, conta que só existe via Google e
 * queda de rede. Cada caso agora tem código e texto próprios.
 */
export type AuthFailureKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "already_registered"
  | "google_only_account"
  | "network"
  | "config"
  | "rate_limited"
  | "weak_password"
  | "unexpected";

export class AuthFailure extends Error {
  kind: AuthFailureKind;
  constructor(kind: AuthFailureKind, message: string) {
    super(message);
    this.name = "AuthFailure";
    this.kind = kind;
  }
}

const MESSAGES: Record<AuthFailureKind, string> = {
  invalid_credentials: "E-mail ou senha incorretos. Confira e tente novamente.",
  email_not_confirmed:
    "Sua conta existe, mas o e-mail ainda não foi confirmado. Abra o link que enviamos para o seu e-mail e depois entre.",
  already_registered: "Já existe uma conta com este e-mail. Faça login ou recupere a senha.",
  google_only_account:
    "Este e-mail já tem conta criada com o Google. Entre com \u201cContinuar com Google\u201d ou use \u201cEsqueci minha senha\u201d para definir uma senha.",
  network: "Sem conexão com o servidor. Verifique a internet do celular e tente de novo.",
  config: "Falha de configuração da autenticação. Avise o suporte do Moto Anjo.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  weak_password: "Senha muito fraca ou vazada. Escolha outra.",
  unexpected: "Não foi possível concluir. Tente novamente em instantes.",
};

export function authFailure(kind: AuthFailureKind, override?: string): AuthFailure {
  return new AuthFailure(kind, override ?? MESSAGES[kind]);
}

/** Classifica o erro bruto vindo do supabase-js. */
export function classifyAuthError(err: unknown): AuthFailure {
  if (err instanceof AuthFailure) return err;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const low = raw.toLowerCase();
  const code = (err as { code?: string } | null)?.code ?? "";
  const status = (err as { status?: number } | null)?.status;

  if (low.includes("failed to fetch") || low.includes("network") || low.includes("load failed")) {
    return authFailure("network");
  }
  if (code === "email_not_confirmed" || low.includes("email not confirmed")) {
    return authFailure("email_not_confirmed");
  }
  if (code === "invalid_credentials" || low.includes("invalid login")) {
    return authFailure("invalid_credentials");
  }
  if (low.includes("already registered") || low.includes("user already")) {
    return authFailure("already_registered");
  }
  if (status === 429 || low.includes("rate limit") || low.includes("too many")) {
    return authFailure("rate_limited");
  }
  if (
    low.includes("weak password") ||
    low.includes("pwned") ||
    low.includes("known to be weak") ||
    low.includes("compromised")
  ) {
    return authFailure("weak_password");
  }
  if (low.includes("password should be at least")) {
    const m = raw.match(/at least (\d+)/i);
    return authFailure("weak_password", `Senha muito curta (mínimo ${m ? m[1] : 8} caracteres).`);
  }
  if (
    low.includes("unsupported provider") ||
    low.includes("provider is not enabled") ||
    low.includes("missing supabase") ||
    low.includes("apikey") ||
    status === 401 ||
    status === 403
  ) {
    return authFailure("config", `Falha de configuração da autenticação (${raw}).`);
  }
  return authFailure("unexpected", raw || MESSAGES.unexpected);
}
