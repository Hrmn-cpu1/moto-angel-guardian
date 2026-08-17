/**
 * Trilha MA-AUTH — instrumentação ponta a ponta do login Google no APK.
 *
 * O bug físico ("Authorization Response" e o app nunca volta) nunca foi
 * observado com dado, só com relato. Em vez de adivinhar qual etapa falha,
 * cada marco do fluxo deixa um registro DURÁVEL (localStorage) e exportável
 * pela tela de diagnóstico: o próximo teste em aparelho mostra exatamente
 * qual foi a última etapa alcançada.
 *
 * Regra de ouro: NADA sensível. Nenhuma credencial, nenhum segredo PKCE,
 * nenhum código de troca, nenhum endereço de e-mail, nenhum JWT. Só nome da
 * etapa, presença booleana e código de erro — tudo passa pelo sanitizador.
 */
import {
  acrescentar,
  lerSessao,
  novaSessao,
  resumirTrilha,
  type EventoPersistido,
  type SessaoDeTrilha,
} from "./trip-trail.ts";

export const EVENTOS_MA_AUTH = [
  "native.detect",
  "oauth.begin",
  "broker.url.created",
  "browser.open",
  "callback.web.enter",
  "callback.web.query.presence",
  "callback.native.detected",
  "state.valid",
  "state.invalid",
  "stash.begin",
  "stash.success",
  "stash.fail",
  "deepLink.begin",
  "deepLink.replace.called",
  "appUrlOpen.received",
  "launchUrl.received",
  "exchange.begin",
  "exchange.success",
  "exchange.fail",
  "dashboard.reached",
] as const;

export type EventoMaAuth = (typeof EVENTOS_MA_AUTH)[number];

/**
 * Etapa macro do fluxo — facilita achar onde a tentativa parou.
 */
export type EtapaMaAuth =
  | "inicio"
  | "broker"
  | "callback"
  | "deeplink"
  | "nativo"
  | "troca"
  | "fim";

const ETAPAS: Record<EventoMaAuth, EtapaMaAuth> = {
  "native.detect": "inicio",
  "oauth.begin": "inicio",
  "broker.url.created": "broker",
  "browser.open": "broker",
  "callback.web.enter": "callback",
  "callback.web.query.presence": "callback",
  "callback.native.detected": "callback",
  "state.valid": "callback",
  "state.invalid": "callback",
  "stash.begin": "callback",
  "stash.success": "callback",
  "stash.fail": "callback",
  "deepLink.begin": "deeplink",
  "deepLink.replace.called": "deeplink",
  "appUrlOpen.received": "nativo",
  "launchUrl.received": "nativo",
  "exchange.begin": "troca",
  "exchange.success": "troca",
  "exchange.fail": "troca",
  "dashboard.reached": "fim",
};

export const CHAVE_TRILHA_AUTH = "moto-anjo:ma-auth:v1";

export interface ContextoDeEvento {
  /** Código curto de erro, já sem valores. */
  error_code?: unknown;
  /** Somente booleanos: presença de parâmetros, nunca conteúdo. */
  flags?: Record<string, boolean>;
}

let sessao: SessaoDeTrilha | null = null;

function armazenamento(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function sorteioDeId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* ambiente sem crypto: cai no relógio */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function garantirSessao(): SessaoDeTrilha {
  if (sessao) return sessao;
  const agora = Date.now();
  const store = armazenamento();
  const anterior = lerSessao(store?.getItem(CHAVE_TRILHA_AUTH) ?? null, agora);
  // A trilha de auth é curta e de uso único por tentativa: continuar a
  // anterior facilita ler um fluxo que atravessou a morte da WebView.
  sessao = anterior ?? novaSessao(`a${agora.toString(36)}${sorteioDeId()}`, agora);
  return sessao;
}

/**
 * Abre uma tentativa nova: `attempt_id` inédito, trilha zerada.
 * Chamado no clique do login — é o que garante que duas tentativas não se
 * misturem no diagnóstico.
 */
export function iniciarTentativaDeAuth(): string {
  const agora = Date.now();
  sessao = novaSessao(`a${agora.toString(36)}${sorteioDeId()}`, agora);
  persistir();
  return sessao.sessionId;
}

export function idDaTentativaDeAuth(): string {
  return garantirSessao().sessionId;
}

function persistir(): void {
  try {
    if (sessao) armazenamento()?.setItem(CHAVE_TRILHA_AUTH, JSON.stringify(sessao));
  } catch {
    /* diagnóstico jamais pode virar uma segunda fonte de falha */
  }
}

/** Detalhe livre nunca entra inteiro: sem URL, sem segredo, curto. */
export function detalheSeguro(valor: unknown): string | undefined {
  if (valor == null) return undefined;
  const limpo = String(valor)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .slice(0, 80);
  return limpo || undefined;
}

function ehNativo(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function localAtual(): { host?: string; path?: string } {
  try {
    if (typeof window === "undefined" || !window.location) return {};
    return { host: window.location.host, path: window.location.pathname };
  } catch {
    return {};
  }
}

function rotularFlags(flags?: Record<string, boolean>): string | undefined {
  if (!flags) return undefined;
  const ativos = Object.entries(flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return ativos.length ? ativos.join("+") : "nenhum";
}

export function registrarEventoDeAuth(
  evento: EventoMaAuth,
  detalhe?: unknown,
  contexto?: ContextoDeEvento,
): EventoPersistido {
  const { host, path } = localAtual();
  const partes = [
    detalheSeguro(detalhe),
    contexto?.error_code ? `err=${detalheSeguro(contexto.error_code)}` : undefined,
    contexto?.flags ? `flags=${rotularFlags(contexto.flags)}` : undefined,
    ehNativo() ? "native" : "web",
    host ? `host=${detalheSeguro(host)}` : undefined,
    path ? `path=${detalheSeguro(path)}` : undefined,
  ].filter(Boolean);
  const registro: EventoPersistido = {
    e: `MA-AUTH:${evento}`,
    t: Date.now(),
    s: ETAPAS[evento],
    ...(partes.length ? { d: partes.join(" ").slice(0, 200) } : {}),
  };
  sessao = acrescentar(garantirSessao(), registro);
  persistir();
  if (typeof console !== "undefined") {
    console.info(`[MA-AUTH] ${evento}${registro.d ? ` ${registro.d}` : ""}`);
  }
  return registro;
}

export function trilhaDeAuth(): EventoPersistido[] {
  return [...garantirSessao().eventos];
}

export function resumoDaTrilhaDeAuth(): string {
  return resumirTrilha(garantirSessao());
}

/**
 * Texto que a pessoa copia da tela de diagnóstico e cola no chat.
 * Só nomes de etapa, flags booleanas, host/rota e códigos de erro.
 */
export function diagnosticoDeAuthExportavel(agoraMs = Date.now()): string {
  const atual = garantirSessao();
  return JSON.stringify(
    {
      diagnostico: "MA-AUTH",
      versao: 1,
      attempt_id: atual.sessionId,
      geradoEm: new Date(agoraMs).toISOString(),
      isNative: ehNativo(),
      host: localAtual().host ?? null,
      eventos: atual.eventos.map((r) => ({
        event: r.e.replace("MA-AUTH:", ""),
        stage: r.s ?? null,
        t: new Date(r.t).toISOString(),
        info: r.d ?? null,
      })),
    },
    null,
    2,
  );
}

export function limparTrilhaDeAuth(): void {
  sessao = null;
  try {
    armazenamento()?.removeItem(CHAVE_TRILHA_AUTH);
  } catch {
    /* ignore */
  }
}
