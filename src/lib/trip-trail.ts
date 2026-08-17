/**
 * Trilha durável do MA-TRIP — regras puras.
 *
 * O problema comprovado no RC6: a trilha vivia em memória (e o diagnóstico em
 * `sessionStorage`). Quando a WebView morre — que é exatamente o caso que
 * queremos investigar — a trilha morre junto e o próximo boot não sabe que
 * houve um fim anormal. Aqui ficam as regras de poda, validade e detecção de
 * sessão inacabada, separadas do armazenamento para poderem ser testadas sem
 * navegador.
 *
 * O que NUNCA entra: token, JWT, telefone, e-mail, endereço, coordenada
 * precisa. Só nome do evento, estado da viagem, origem e código de erro.
 */

export const VERSAO_TRILHA = 1;
export const MAX_EVENTOS_TRILHA = 40;
/** Trilha velha é ruído: não ajuda a explicar o crash de agora. */
export const TTL_TRILHA_MS = 6 * 60 * 60 * 1000;

export interface EventoPersistido {
  /** nome do evento */
  e: string;
  /** timestamp */
  t: number;
  /** detalhe técnico curto e sanitizado */
  d?: string;
  /** duração em ms */
  ms?: number;
  /** estado da viagem no momento */
  s?: string;
}

export interface SessaoDeTrilha {
  v: number;
  sessionId: string;
  startedAt: number;
  updatedAt: number;
  /** `false` enquanto a sessão não foi encerrada de forma limpa. */
  finished: boolean;
  eventos: EventoPersistido[];
}

export function novaSessao(sessionId: string, agoraMs: number): SessaoDeTrilha {
  return { v: VERSAO_TRILHA, sessionId, startedAt: agoraMs, updatedAt: agoraMs, finished: false, eventos: [] };
}

export function acrescentar(
  sessao: SessaoDeTrilha,
  evento: EventoPersistido,
): SessaoDeTrilha {
  return {
    ...sessao,
    updatedAt: evento.t,
    eventos: [...sessao.eventos, evento].slice(-MAX_EVENTOS_TRILHA),
  };
}

/** `null` para qualquer coisa que não seja uma sessão desta versão e dentro do TTL. */
export function lerSessao(cru: string | null, agoraMs: number): SessaoDeTrilha | null {
  if (!cru) return null;
  try {
    const lido = JSON.parse(cru) as Partial<SessaoDeTrilha>;
    if (!lido || lido.v !== VERSAO_TRILHA) return null;
    if (typeof lido.sessionId !== "string" || typeof lido.updatedAt !== "number") return null;
    if (agoraMs - lido.updatedAt > TTL_TRILHA_MS) return null;
    return {
      v: VERSAO_TRILHA,
      sessionId: lido.sessionId,
      startedAt: typeof lido.startedAt === "number" ? lido.startedAt : lido.updatedAt,
      updatedAt: lido.updatedAt,
      finished: lido.finished === true,
      eventos: Array.isArray(lido.eventos)
        ? lido.eventos.filter((e): e is EventoPersistido => !!e && typeof e.e === "string" && typeof e.t === "number")
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * A sessão anterior terminou de forma anormal?
 *
 * Critério honesto: existe trilha, ela não foi marcada como finalizada e não é
 * da sessão atual. Só isso — não inventamos causa.
 */
export function sessaoAnteriorInacabada(
  anterior: SessaoDeTrilha | null,
  sessionIdAtual: string,
): boolean {
  if (!anterior) return false;
  if (anterior.sessionId === sessionIdAtual) return false;
  if (anterior.finished) return false;
  return anterior.eventos.length > 0;
}

/** Texto compacto para anexar ao diagnóstico. */
export function resumirTrilha(sessao: SessaoDeTrilha | null, limite = 900): string {
  if (!sessao) return "";
  return sessao.eventos
    .map((r) => `${r.e}${r.d ? `:${r.d}` : ""}`)
    .join(" > ")
    .slice(0, limite);
}
