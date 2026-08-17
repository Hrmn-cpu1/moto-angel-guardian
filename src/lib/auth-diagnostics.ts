/**
 * Trilha MA-AUTH — instrumentação ponta a ponta do login Google no APK.
 *
 * O bug físico ("Authorization Response" e o app nunca volta) nunca foi
 * observado com dado, só com relato. Em vez de adivinhar qual etapa falha,
 * cada marco do fluxo passa a deixar um registro DURÁVEL: o próximo teste em
 * aparelho mostra exatamente qual foi a última etapa alcançada.
 *
 * Regra de ouro: NADA sensível. Nenhuma credencial, nenhum segredo PKCE,
 * nenhum código de troca, nenhum endereço de e-mail. Só nome da etapa,
 * presença booleana e código de erro — tudo passa pelo sanitizador abaixo.
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
  "callback.native.detected",
  "stash.begin",
  "stash.success",
  "deepLink.begin",
  "appUrlOpen.received",
  "launchUrl.received",
  "state.valid",
  "state.invalid",
  "exchange.begin",
  "exchange.success",
  "exchange.fail",
] as const;

export type EventoMaAuth = (typeof EVENTOS_MA_AUTH)[number];

const CHAVE = "moto-anjo:ma-auth:v1";

let sessao: SessaoDeTrilha | null = null;

function armazenamento(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function garantirSessao(): SessaoDeTrilha {
  if (sessao) return sessao;
  const agora = Date.now();
  const store = armazenamento();
  const anterior = lerSessao(store?.getItem(CHAVE) ?? null, agora);
  // A trilha de auth é curta e de uso único por tentativa: continuar a
  // anterior facilita ler um fluxo que atravessou a morte da WebView.
  sessao = anterior ?? novaSessao(`a${agora.toString(36)}`, agora);
  return sessao;
}

/** Detalhe livre nunca entra inteiro: sem URL, sem coordenada, curto. */
function detalheSeguro(valor: unknown): string | undefined {
  if (valor == null) return undefined;
  return String(valor)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .slice(0, 80);
}

export function registrarEventoDeAuth(evento: EventoMaAuth, detalhe?: unknown): EventoPersistido {
  const registro: EventoPersistido = {
    e: `MA-AUTH:${evento}`,
    t: Date.now(),
    ...(detalheSeguro(detalhe) ? { d: detalheSeguro(detalhe) } : {}),
  };
  sessao = acrescentar(garantirSessao(), registro);
  try {
    armazenamento()?.setItem(CHAVE, JSON.stringify(sessao));
  } catch {
    /* diagnóstico jamais pode virar uma segunda fonte de falha */
  }
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

export function limparTrilhaDeAuth(): void {
  sessao = null;
  try {
    armazenamento()?.removeItem(CHAVE);
  } catch {
    /* ignore */
  }
}
