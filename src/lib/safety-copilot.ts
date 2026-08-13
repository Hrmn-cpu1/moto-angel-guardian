import { APARENCIA, distanciaCurta, eventoParaCartao, type EventoNoMapa } from "./map-events.ts";

/**
 * Safety Copilot — o que avisar, quando avisar, e quando calar a boca.
 *
 * A parte difícil não é achar o evento mais próximo: é não virar ruído. Um
 * app que fala a cada 10 segundos é desligado no primeiro dia, e aí não avisa
 * nem quando importa. Por isso três regras, todas testáveis:
 *
 *   1. UM aviso por vez. Nunca uma pilha.
 *   2. Cooldown: o mesmo evento não repete antes do intervalo.
 *   3. Deduplicação: o mesmo id não é anunciado duas vezes, a não ser que
 *      tenha subido de prioridade ou chegado muito mais perto.
 *
 * Puro de propósito: nenhuma dependência de voz, de React ou de plataforma.
 */

export interface AvisoCopiloto {
  id: string;
  categoria: EventoNoMapa["categoria"];
  /** Texto curto para a tela. */
  texto: string;
  /** Frase para a voz. Sem abreviação, porque será lida em voz alta. */
  fala: string;
  prioridade: number;
  distanciaKm: number;
}

export interface MemoriaCopiloto {
  /** id do evento -> quando foi anunciado (ms) e a que distância. */
  anunciados: Record<string, { emMs: number; distanciaKm: number }>;
  /** O aviso que está na tela agora. */
  atual: AvisoCopiloto | null;
}

export const MEMORIA_INICIAL: MemoriaCopiloto = { anunciados: {}, atual: null };

/** Intervalo mínimo antes de repetir o MESMO evento. */
export const COOLDOWN_MS = 90_000;
/** Só repete antes do cooldown se tiver chegado bem mais perto que isso. */
export const REAPROXIMACAO_KM = 0.5;

export function textoDoAviso(e: EventoNoMapa): string {
  return `${APARENCIA[e.categoria].rotulo} · ${distanciaCurta(e.distanciaKm)}`;
}

/**
 * Frase falada. Escrita para ser ouvida com capacete e vento, então: curta,
 * sem sigla, sem número quebrado.
 */
export function falaDoAviso(e: EventoNoMapa): string {
  const distancia =
    e.distanciaKm < 1
      ? `a ${Math.round((e.distanciaKm * 1000) / 50) * 50} metros`
      : `a ${e.distanciaKm.toFixed(1).replace(".", ",")} quilômetros`;
  switch (e.categoria) {
    case "sos":
      return `Motociclista pedindo ajuda ${distancia}.`;
    case "acidente":
      return `Acidente ${distancia}.`;
    case "roubo":
      return `Ocorrência de segurança ${distancia}.`;
    case "perigo":
      return `Atenção, perigo ${distancia}.`;
    case "buraco":
      return `Buraco ${distancia}.`;
    case "bloqueio":
      return `Via bloqueada ${distancia}.`;
    case "blitz":
      return `Fiscalização ${distancia}.`;
    default:
      return `${APARENCIA[e.categoria].rotulo} ${distancia}.`;
  }
}

export interface ResultadoCopiloto {
  memoria: MemoriaCopiloto;
  /** Aviso a mostrar. `null` quando não há nada que valha a tela. */
  aviso: AvisoCopiloto | null;
  /** Só verdadeiro na primeira vez — é o gatilho da voz. */
  falarAgora: boolean;
}

/**
 * Decide o que o copiloto mostra e se deve falar.
 *
 * `modo` importa: parado, o alcance é maior porque dá para decidir a rota;
 * pilotando, só o que é problema de agora.
 */
export function avaliarCopiloto(
  memoria: MemoriaCopiloto,
  eventos: EventoNoMapa[],
  agoraMs: number,
  modo: "parado" | "pilotando" = "pilotando",
): ResultadoCopiloto {
  const escolhido = eventoParaCartao(eventos, modo);

  if (!escolhido) {
    return { memoria: { ...memoria, atual: null }, aviso: null, falarAgora: false };
  }

  const aviso: AvisoCopiloto = {
    id: escolhido.id,
    categoria: escolhido.categoria,
    texto: textoDoAviso(escolhido),
    fala: falaDoAviso(escolhido),
    prioridade: APARENCIA[escolhido.categoria].prioridade,
    distanciaKm: escolhido.distanciaKm,
  };

  const jaAnunciado = memoria.anunciados[escolhido.id];
  let falarAgora = false;

  if (!jaAnunciado) {
    falarAgora = true;
  } else {
    const passou = agoraMs - jaAnunciado.emMs >= COOLDOWN_MS;
    const chegouMuitoMaisPerto =
      jaAnunciado.distanciaKm - escolhido.distanciaKm >= REAPROXIMACAO_KM;
    falarAgora = passou || chegouMuitoMaisPerto;
  }

  const anunciados = falarAgora
    ? {
        ...memoria.anunciados,
        [escolhido.id]: { emMs: agoraMs, distanciaKm: escolhido.distanciaKm },
      }
    : memoria.anunciados;

  return { memoria: { anunciados, atual: aviso }, aviso, falarAgora };
}

/** Limpa registros velhos: a memória não pode crescer para sempre. */
export function limparMemoria(memoria: MemoriaCopiloto, agoraMs: number): MemoriaCopiloto {
  const limite = COOLDOWN_MS * 4;
  const anunciados: MemoriaCopiloto["anunciados"] = {};
  for (const [id, reg] of Object.entries(memoria.anunciados)) {
    if (agoraMs - reg.emMs < limite) anunciados[id] = reg;
  }
  return { ...memoria, anunciados };
}
