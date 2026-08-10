/**
 * Troca segura da sessão do login nativo (Android).
 *
 * Auditoria de segurança: o deep link `com.motoanjo.app://auth/callback` NÃO
 * pode transportar access_token/refresh_token — qualquer app instalado que
 * registre o mesmo scheme poderia lê-los. Usamos o padrão Authorization Code
 * + PKCE (RFC 7636):
 *
 *   1. o app sorteia um `code_verifier` e envia só o `code_challenge`
 *      (SHA-256, base64url) para a página de callback;
 *   2. a página de callback guarda a sessão no servidor e recebe um `code`
 *      opaco, de uso único e validade de 5 minutos;
 *   3. o deep link carrega apenas esse `code`;
 *   4. o app troca `code` + `code_verifier` pela sessão por HTTPS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

const StashSchema = z.object({
  access_token: z.string().min(10).max(8000),
  refresh_token: z.string().min(10).max(8000),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

const ExchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code_verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Guarda a sessão e devolve o código de uso único. */
export const stashNativeSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => StashSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("purge_native_auth_codes");
    const code = randomBytes(32).toString("base64url");
    const { error } = await supabaseAdmin.from("native_auth_codes").insert({
      code,
      code_challenge: data.code_challenge,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) throw new Error("Não foi possível concluir o login. Tente novamente.");
    return { code };
  });

/** Troca o código pela sessão, uma única vez. */
export const exchangeNativeCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ExchangeSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("native_auth_codes")
      .select("code, code_challenge, access_token, refresh_token, expires_at, used_at")
      .eq("code", data.code)
      .maybeSingle();

    // Consome o código sempre — mesmo em falha — para impedir força bruta.
    if (row) {
      await supabaseAdmin.from("native_auth_codes").delete().eq("code", data.code);
    }
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("Código de login expirado. Entre novamente.");
    }
    if (sha256Base64Url(data.code_verifier) !== row.code_challenge) {
      throw new Error("Verificação de segurança do login falhou.");
    }
    return { access_token: row.access_token, refresh_token: row.refresh_token };
  });
