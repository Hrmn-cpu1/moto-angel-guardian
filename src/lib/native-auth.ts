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
 *   Moto Anjo (sorteia o par PKCE) -> Custom Tab (Chrome real)
 *   -> Google -> callback https /auth/callback (caminho limpo; o desafio
 *      PKCE viaja dentro do `state`, que o broker devolve intacto)
 *   -> a página guarda a sessão no servidor e recebe um code opaco
 *   -> deep link com.motoanjo.app://auth/callback?code=...&state=...
 *   -> aqui o `state` é CONFERIDO e só então o code vira sessão.
 *
 * RC7: o retorno antes vinha para um redirect_uri com parâmetros próprios,
 * fora do contrato de três parâmetros que o broker oficialmente aceita — a
 * hipótese mais provável para o fluxo travar em "Authorization Response" no
 * aparelho. E o `state` era sorteado sem nunca ser verificado na volta.
 *
 * O deep link nunca carrega senha nem credencial de sessão.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./native";
import { authFailure } from "./auth-errors";
import { exchangeNativeCode } from "./native-auth.functions";
import { iniciarTentativaDeAuth, registrarEventoDeAuth } from "./auth-diagnostics";
import {
  caminhoDeCallbackNativo,
  montarEstadoNativo,
  validarEstadoDeRetorno,
  type PendenciaDeEstado,
} from "./oauth-state";

export const NATIVE_CALLBACK_SCHEME = "com.motoanjo.app";
export const NATIVE_CALLBACK_URL = `${NATIVE_CALLBACK_SCHEME}://auth/callback`;
const TIMEOUT_MS = 180_000;
const PKCE_VERIFIER_KEY = "moto_anjo_native_pkce_verifier";
const PKCE_STATE_KEY = "moto_anjo_native_oauth_state";

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

/**
 * A pendência do `state` (RC7 / P0.2).
 *
 * Antes o `state` era sorteado, enviado e esquecido. Guardar o nonce aqui é o
 * que permite recusar uma resposta que não corresponde à tentativa iniciada
 * neste aparelho. Uso único: é consumido na primeira validação.
 */
function salvarPendenciaDeEstado(nonce: string): void {
  window.localStorage.setItem(
    PKCE_STATE_KEY,
    JSON.stringify({ nonce, criadoEm: Date.now() } satisfies PendenciaDeEstado),
  );
}

function consumirPendenciaDeEstado(): PendenciaDeEstado | null {
  try {
    const cru = window.localStorage.getItem(PKCE_STATE_KEY);
    window.localStorage.removeItem(PKCE_STATE_KEY);
    if (!cru) return null;
    const lido = JSON.parse(cru) as Partial<PendenciaDeEstado>;
    if (typeof lido?.nonce !== "string" || typeof lido?.criadoEm !== "number") return null;
    return { nonce: lido.nonce, criadoEm: lido.criadoEm };
  } catch {
    return null;
  }
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
  console.info(source === "appUrlOpen" ? "APP_URL_OPEN_RECEIVED" : "LAUNCH_URL_RECEIVED");
  console.info(`[NativeAuth] origem: ${source}`);
  registrarEventoDeAuth(source === "appUrlOpen" ? "appUrlOpen.received" : "launchUrl.received");

  const parsed = parseAuthCallback(rawUrl);
  console.info(`[NativeAuth] code present: ${Boolean(parsed.code)}`);
  if (
    callbackUrl.searchParams.has("access_token") ||
    callbackUrl.searchParams.has("refresh_token")
  ) {
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

      // Falha fechada: sem `state` conferido, a resposta não é aceita. Isto é
      // o que impede que outro app registrado no mesmo esquema — ou um
      // retorno que nunca partiu daqui — force uma sessão no Moto Anjo.
      const veredito = validarEstadoDeRetorno(
        callbackUrl.searchParams.get("state"),
        consumirPendenciaDeEstado(),
        Date.now(),
      );
      if (!veredito.ok) {
        registrarEventoDeAuth("state.invalid", veredito.falha);
        throw authFailure("unexpected", "Verificação de segurança do login falhou.");
      }
      registrarEventoDeAuth("state.valid");

      if (!parsed.code) throw authFailure("unexpected", "Retorno do Google sem código.");
      const verifier = takeVerifier();
      if (!verifier)
        throw authFailure("unexpected", "Verificação PKCE não encontrada. Entre novamente.");

      // O broker retorna uma sessão à página HTTPS. Ela é convertida ali em
      // um código opaco, único e vinculado a este verifier PKCE. Somente esta
      // troca HTTPS devolve a sessão; tokens nunca passam pelo deep link.
      registrarEventoDeAuth("exchange.begin");
      console.info("EXCHANGE_BEGIN");
      const exchanged = await exchangeNativeCode({
        data: { code: parsed.code, code_verifier: verifier },
      });
      registrarEventoDeAuth("exchange.success");
      console.info("EXCHANGE_SUCCESS");
      const { data, error } = await supabase.auth.setSession(exchanged);
      console.info(`[NativeAuth] exchangeCodeForSession ${error ? "error" : "success"}`);
      if (error || !data.session)
        throw authFailure("unexpected", error?.message ?? "Sessão ausente.");

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
      console.info("SESSION_CONFIRMED");

      processedCallbacks.add(callbackKey);
      pendingAttempt?.resolve();
      pendingAttempt = null;
      const { Browser } = await import("@capacitor/browser");
      await Browser.close().catch(() => undefined);
      console.info("BROWSER_CLOSE");
      console.info("[NativeAuth] rota final: /dashboard");
      registrarEventoDeAuth("dashboard.reached");
      console.info("DASHBOARD_NATIVE");
      window.location.replace("/dashboard");
      return true;
    } catch (error) {
      console.error("[NativeAuth] exchangeCodeForSession error");
      console.error("EXCHANGE_FAIL");
      registrarEventoDeAuth("exchange.fail", error instanceof Error ? error.name : "unknown");
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
    // `native.detect` estava declarado e nunca registrado: agora marca o
    // instante em que o app confirma que roda dentro do APK.
    registrarEventoDeAuth("native.detect", "bootstrap");
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", ({ url }) => {
      if (url) void handleNativeAuthUrl(url, "appUrlOpen").catch(() => undefined);
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) await handleNativeAuthUrl(launch.url, "getLaunchUrl");
    setNativeAuthProcessing(false);
  })().catch((error) => {
    setNativeAuthProcessing(false);
    console.error(
      "[NativeAuth] bootstrap error",
      error instanceof Error ? error.message : "unknown",
    );
  });
  return nativeBootstrap;
}

export async function signInWithGoogleNative(): Promise<void> {
  const nativo = isNativeApp();
  // Uma tentativa nova = um attempt_id novo: duas tentativas nunca se
  // misturam na trilha exportada.
  iniciarTentativaDeAuth();
  registrarEventoDeAuth("native.detect", nativo ? "apk" : "web");
  if (!nativo) throw authFailure("config", "Fluxo nativo chamado fora do aplicativo.");

  const { Browser } = await import("@capacitor/browser");
  await bootstrapNativeAuth();

  registrarEventoDeAuth("oauth.begin");
  console.info("OAUTH_NATIVE_OPEN");
  const origin = window.location.origin;
  const nonce = randomState();
  const { verifier, challenge } = await createPkcePair();
  saveVerifier(verifier);
  salvarPendenciaDeEstado(nonce);

  // Contrato do broker: `provider`, `redirect_uri` e `state` — nada mais.
  // O `redirect_uri` volta a ser um caminho limpo, sem parâmetros próprios —
  // formato que o SDK oficial usa e o único que temos motivo para crer
  // que passa pela lista de permissões do broker. O `code_challenge` viaja
  // dentro do `state`, que o broker devolve intacto — e que agora também é
  // conferido na volta.
  const state = montarEstadoNativo(nonce, challenge);
  // O marcador vai também no CAMINHO do redirect_uri: é o único sinal que não
  // depende do broker devolver o `state` intacto. Sem ele, a página de
  // callback tratava o retorno como navegador e a sessão nascia dentro do
  // Custom Tab — o app continuava deslogado.
  const redirectUri = caminhoDeCallbackNativo(origin, nonce, challenge);
  const authUrl =
    `${origin}/~oauth/initiate?provider=google` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  registrarEventoDeAuth("broker.url.created");

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
    registrarEventoDeAuth("browser.open");
    void Browser.open({ url: authUrl, presentationStyle: "popover" }).catch((error) =>
      finish(() => reject(authFailure("unexpected", String(error)))),
    );
  });
}
