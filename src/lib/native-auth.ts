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
const PKCE_VERIFIER_KEY = "moto_anjo_native_pkce_verifier";

type NativeAuthSource = "appUrlOpen" | "getLaunchUrl";
type NativeAuthSnapshot = { processing: boolean };

let nativeAuthSnapshot: NativeAuthSnapshot = { processing: isNativeApp() };
const nativeAuthListeners = new Set<() => void>();
const processedCallbacks = new Set<string>();
const callbackJobs = new Map<string, Promise<boolean>>();
let nativeBootstrap: Promise<void> | null = null;
let pendingAttempt: {
  resolve: () => void;
  reject: (error: unknown) => void;
} | null = null;

function setNativeAuthProcessing(processing: boolean): void {
  nativeAuthSnapshot = { processing };
  nativeAuthListeners.forEach((listener) => listener());
}

export function subscribeNativeAuth(listener: () => void): () => void {
  nativeAuthListeners.add(listener);
  return () => nativeAuthListeners.delete(listener);
}

export function getNativeAuthSnapshot(): NativeAuthSnapshot {
  return nativeAuthSnapshot;
}

function saveVerifier(verifier: string): void {
  window.localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
}

function takeVerifier(): string | null {
  const verifier = window.localStorage.getItem(PKCE_VERIFIER_KEY);
  window.localStorage.removeItem(PKCE_VERIFIER_KEY);
  return verifier;
}

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

function isNativeCallback(url: URL): boolean {
  return (
    url.protocol === `${NATIVE_CALLBACK_SCHEME}:` &&
    url.hostname === "auth" &&
    url.pathname === "/callback"
  );
}

async function waitForSignedIn(userId: string): Promise<boolean> {
  const current = await supabase.auth.getSession();
  if (current.data.session?.user.id === userId) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => finish(false), 5_000);
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user.id === userId) finish(true);
    });
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      subscription.data.subscription.unsubscribe();
      resolve(result);
    };
  });
}

/**
 * Único consumidor do deep link nativo. É usado tanto pelo evento em runtime
 * quanto pelo cold start e deduplica callbacks recebidos pelas duas fontes.
 */
export async function handleNativeAuthUrl(
  rawUrl: string,
  source: NativeAuthSource,
): Promise<boolean> {
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!isNativeCallback(callbackUrl)) return false;

  console.info("[NativeAuth] native callback received");
  console.info(`[NativeAuth] origem: ${source}`);

  const parsed = parseAuthCallback(rawUrl);
  console.info(`[NativeAuth] code present: ${Boolean(parsed.code)}`);
  if (callbackUrl.searchParams.has("access_token") || callbackUrl.searchParams.has("refresh_token")) {
    console.error("[NativeAuth] callback rejeitado: token sensível na URL");
    pendingAttempt?.reject(authFailure("config", "Retorno de login inseguro foi bloqueado."));
    pendingAttempt = null;
    return true;
  }

  const callbackKey = rawUrl;
  if (processedCallbacks.has(callbackKey)) return true;
  const running = callbackJobs.get(callbackKey);
  if (running) return running;

  const job = (async () => {
    setNativeAuthProcessing(true);
    try {
      if (parsed.error) throw authFailure("unexpected", parsed.error);
      if (!parsed.code) throw authFailure("unexpected", "Retorno do Google sem código.");
      const verifier = takeVerifier();
      if (!verifier) throw authFailure("unexpected", "Verificação PKCE não encontrada. Entre novamente.");

      // O broker retorna uma sessão à página HTTPS. Ela é convertida ali em
      // um código opaco, único e vinculado a este verifier PKCE. Somente esta
      // troca HTTPS devolve a sessão; tokens nunca passam pelo deep link.
      const exchanged = await exchangeNativeCode({
        data: { code: parsed.code, code_verifier: verifier },
      });
      const { data, error } = await supabase.auth.setSession(exchanged);
      console.info(`[NativeAuth] exchangeCodeForSession ${error ? "error" : "success"}`);
      if (error || !data.session) throw authFailure("unexpected", error?.message ?? "Sessão ausente.");

      const signedInObserved = await waitForSignedIn(data.session.user.id);
      const confirmed = await supabase.auth.getSession();
      const sameSession =
        confirmed.data.session?.user.id === data.session.user.id &&
        confirmed.data.session.access_token === data.session.access_token;
      console.info(`[NativeAuth] session present after exchange: ${sameSession}`);
      console.info(`[NativeAuth] user id present: ${Boolean(confirmed.data.session?.user.id)}`);
      if (!signedInObserved || !sameSession) {
        throw authFailure("unexpected", "A sessão não pôde ser confirmada no aplicativo.");
      }

      processedCallbacks.add(callbackKey);
      pendingAttempt?.resolve();
      pendingAttempt = null;
      const { Browser } = await import("@capacitor/browser");
      await Browser.close().catch(() => undefined);
      console.info("[NativeAuth] rota final: /dashboard");
      window.location.replace("/dashboard");
      return true;
    } catch (error) {
      console.error("[NativeAuth] exchangeCodeForSession error");
      pendingAttempt?.reject(error);
      pendingAttempt = null;
      throw error;
    } finally {
      setNativeAuthProcessing(false);
      callbackJobs.delete(callbackKey);
    }
  })();

  callbackJobs.set(callbackKey, job);
  return job;
}

/** Registra o listener permanente e recupera deep links que abriram o app a frio. */
export function bootstrapNativeAuth(): Promise<void> {
  if (!isNativeApp()) {
    setNativeAuthProcessing(false);
    return Promise.resolve();
  }
  if (nativeBootstrap) return nativeBootstrap;

  nativeBootstrap = (async () => {
    setNativeAuthProcessing(true);
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", ({ url }) => {
      if (url) void handleNativeAuthUrl(url, "appUrlOpen").catch(() => undefined);
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) await handleNativeAuthUrl(launch.url, "getLaunchUrl");
    setNativeAuthProcessing(false);
  })().catch((error) => {
    setNativeAuthProcessing(false);
    console.error("[NativeAuth] bootstrap error", error instanceof Error ? error.message : "unknown");
  });
  return nativeBootstrap;
}

export async function signInWithGoogleNative(): Promise<void> {
  if (!isNativeApp()) throw authFailure("config", "Fluxo nativo chamado fora do aplicativo.");

  const { Browser } = await import("@capacitor/browser");
  await bootstrapNativeAuth();

  const origin = window.location.origin;
  const state = randomState();
  const { verifier, challenge } = await createPkcePair();
  saveVerifier(verifier);
  const redirectUri = `${origin}/auth/callback?native=1&cc=${encodeURIComponent(challenge)}`;
  const authUrl =
    `${origin}/~oauth/initiate?provider=google` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  await new Promise<void>((resolve, reject) => {
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
      void Browser.close().catch(() => undefined);
      action();
    };
    pendingAttempt = {
      resolve: () => finish(resolve),
      reject: (error) => finish(() => reject(error)),
    };
    void Browser.open({ url: authUrl, presentationStyle: "popover" }).catch((error) =>
      finish(() => reject(authFailure("unexpected", String(error)))),
    );
  });
}
