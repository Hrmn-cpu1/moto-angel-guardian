/**
 * Login com Google dentro do APK (Capacitor).
 *
 * Por que existe: no WebView o SDK do Lovable faz um redirect de página cheia
 * para /~oauth/initiate, que redireciona para oauth.lovable.app. Esse host não
 * era navegável dentro do app, então o Android jogava a pessoa no Chrome no
 * meio do fluxo — e o Google respondia 400 porque o request saía do contexto
 * (cookie de estado/PKCE) onde havia começado.
 *
 * Fluxo adotado agora (Authorization Code + PKCE):
 *   Moto Anjo (sorteia code_verifier) -> Custom Tab (Chrome real)
 *   -> Google -> callback https /auth/callback?native=1&cc=<code_challenge>
 *   -> a página guarda a sessão no servidor e recebe um code opaco
 *   -> deep link com.motoanjo.app://auth/callback?code=<code>
 *   -> listener aqui troca code + code_verifier pela sessão -> setSession.
 *
 * O deep link nunca carrega senha, access_token ou refresh_token.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./native";
import { authFailure } from "./auth-errors";
import { exchangeNativeCode } from "./native-auth.functions";

export const NATIVE_CALLBACK_SCHEME = "com.motoanjo.app";
export const NATIVE_CALLBACK_URL = `${NATIVE_CALLBACK_SCHEME}://auth/callback`;
const TIMEOUT_MS = 180_000;

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  view.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Par PKCE (RFC 7636, método S256). */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(digest) };
}

/** Extrai parâmetros de retorno tanto do hash quanto da query de uma URL. */
export function parseAuthCallback(url: string): {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  error?: string;
} {
  const out: Record<string, string> = {};
  const grab = (part: string) => {
    if (!part) return;
    new URLSearchParams(part.replace(/^[#?]/, "")).forEach((v, k) => {
      if (!out[k]) out[k] = v;
    });
  };
  const hashAt = url.indexOf("#");
  const queryAt = url.indexOf("?");
  if (hashAt >= 0) grab(url.slice(hashAt));
  if (queryAt >= 0) grab(url.slice(queryAt, hashAt >= 0 ? hashAt : undefined));
  return {
    access_token: out.access_token,
    refresh_token: out.refresh_token,
    code: out.code,
    error: out.error_description || out.error,
  };
}

export async function signInWithGoogleNative(): Promise<void> {
  if (!isNativeApp()) throw authFailure("config", "Fluxo nativo chamado fora do aplicativo.");

  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");

  const origin = window.location.origin;
  const state = randomState();
  const { verifier, challenge } = await createPkcePair();
  const redirectUri = `${origin}/auth/callback?native=1&cc=${encodeURIComponent(challenge)}`;
  const authUrl =
    `${origin}/~oauth/initiate?provider=google` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(authFailure("network", "O login com Google demorou demais. Tente novamente.")),
        ),
      TIMEOUT_MS,
    );

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void handle.then((h) => h.remove()).catch(() => undefined);
      void Browser.close().catch(() => undefined);
      action();
    };

    const handle = App.addListener("appUrlOpen", ({ url }) => {
      if (!url || !url.startsWith(NATIVE_CALLBACK_SCHEME + "://")) return;
      const parsed = parseAuthCallback(url);
      if (parsed.error) return finish(() => reject(authFailure("unexpected", parsed.error!)));
      if (!parsed.code) {
        return finish(() => reject(authFailure("unexpected", "Retorno do Google sem código.")));
      }
      finish(() => resolve(parsed.code!));
    });

    void handle
      .then(() => Browser.open({ url: authUrl, presentationStyle: "popover" }))
      .catch((e) => finish(() => reject(authFailure("unexpected", String(e)))));
  });

  const session = await exchangeNativeCode({ data: { code, code_verifier: verifier } }).catch(
    (e: unknown) => {
      throw authFailure("unexpected", e instanceof Error ? e.message : String(e));
    },
  );
  const { error } = await supabase.auth.setSession(session);
  if (error) throw authFailure("unexpected", error.message);
}
