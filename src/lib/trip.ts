import { normalizarDestino, type Destination } from "./external-navigation.ts";

/**
 * Viagem Segura — fonte única de verdade.
 *
 * A Home passa a ser o lugar da viagem, e por isso o estado não pode viver
 * dentro de um componente: trocar de aba desmonta a Home, e a viagem não pode
 * morrer com isso. O estado mora no módulo, com espelho no armazenamento
 * local para sobreviver a um remount completo.
 *
 * A rota /trip continua existindo por compatibilidade, mas lê e escreve
 * daqui. Duas implementações da mesma viagem seria a receita para elas
 * divergirem — foi o que já aconteceu com a camada de riders.
 */

export type EstadoViagem =
  /** A — parado, sem viagem */
  | "ocioso"
  /** B — destino recebido, aguardando confirmação da pessoa */
  | "preparando"
  /** C — viagem segura em curso */
  | "ativa";

export interface Viagem {
  estado: EstadoViagem;
  destino: Destination | null;
  /** Quando a viagem começou. `null` fora do estado ativo. */
  iniciadaEm: number | null;
  /** De onde veio o destino: digitado, colado, ou recebido de outro app. */
  origemDoDestino: "manual" | "externo" | null;
}

export const VIAGEM_INICIAL: Viagem = {
  estado: "ocioso",
  destino: null,
  iniciadaEm: null,
  origemDoDestino: null,
};

export const CHAVE_VIAGEM = "moto-anjo:viagem";

/* ================================================================== *
 * Transições — puras
 * ================================================================== */

/**
 * Um destino chegou. NUNCA inicia a viagem sozinho.
 *
 * Isto é regra de segurança, não de interface: um destino pode chegar de um
 * aplicativo externo por Intent, e começar a proteger alguém sem que a pessoa
 * tenha pedido significa ligar rastreamento e sensores sem consentimento. O
 * destino chega, aparece na tela, e espera confirmação.
 */
export function receberDestino(
  viagem: Viagem,
  entrada: unknown,
  origem: "manual" | "externo",
): Viagem {
  const destino = normalizarDestino(entrada);
  if (!destino) return viagem;

  // Com viagem em curso, um destino novo não sequestra a viagem atual.
  if (viagem.estado === "ativa") return viagem;

  return { estado: "preparando", destino, iniciadaEm: null, origemDoDestino: origem };
}

export function iniciarViagem(viagem: Viagem, agoraMs: number): Viagem {
  if (viagem.estado !== "preparando" || !viagem.destino) return viagem;
  return { ...viagem, estado: "ativa", iniciadaEm: agoraMs };
}

export function cancelarPreparacao(viagem: Viagem): Viagem {
  return viagem.estado === "preparando" ? { ...VIAGEM_INICIAL } : viagem;
}

/**
 * Finaliza a viagem.
 *
 * `sosAtivo` entra aqui de propósito: encerrar a viagem NÃO pode encerrar um
 * SOS em andamento. São coisas separadas, e a emergência ganha. Com SOS
 * ativo, a viagem sai do ar mas o SOS segue de pé — quem encerra emergência é
 * `sos_cancel`/`sos_resolve`, nunca um botão de "finalizar viagem".
 */
export function finalizarViagem(viagem: Viagem, sosAtivo: boolean): Viagem {
  if (viagem.estado !== "ativa") return viagem;
  void sosAtivo; // registrado por clareza: não altera o resultado da viagem
  return { ...VIAGEM_INICIAL };
}

/** O que a interface precisa mostrar em cada estado. */
export function rotuloDaAcao(viagem: Viagem): string {
  switch (viagem.estado) {
    case "ocioso":
      return "Iniciar viagem segura";
    case "preparando":
      return "Iniciar viagem segura";
    case "ativa":
      return "Finalizar viagem";
  }
}

/** Listeners exclusivos da viagem só rodam com ela ativa. */
export function deveRastrear(viagem: Viagem): boolean {
  return viagem.estado === "ativa";
}

/* ================================================================== *
 * Persistência
 * ================================================================== */

export interface ArmazenamentoSimples {
  getItem: (chave: string) => string | null;
  setItem: (chave: string, valor: string) => void;
  removeItem: (chave: string) => void;
}

function armazenamentoDoNavegador(): ArmazenamentoSimples | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Viagem parada há mais de 12 h é resquício, não viagem. */
export const VALIDADE_MS = 12 * 60 * 60 * 1000;

export function carregarViagem(
  agoraMs: number = Date.now(),
  store: ArmazenamentoSimples | null = armazenamentoDoNavegador(),
): Viagem {
  if (!store) return { ...VIAGEM_INICIAL };
  try {
    const cru = store.getItem(CHAVE_VIAGEM);
    if (!cru) return { ...VIAGEM_INICIAL };
    const lido = JSON.parse(cru) as Viagem;
    if (!["ocioso", "preparando", "ativa"].includes(lido.estado)) return { ...VIAGEM_INICIAL };

    // Um destino que voltou do armazenamento é entrada não confiável como
    // qualquer outra: passa pelo mesmo normalizador.
    const destino = lido.destino ? normalizarDestino(lido.destino) : null;
    if (lido.estado !== "ocioso" && !destino) return { ...VIAGEM_INICIAL };

    if (lido.estado === "ativa" && lido.iniciadaEm != null) {
      if (agoraMs - lido.iniciadaEm > VALIDADE_MS) return { ...VIAGEM_INICIAL };
    }
    return {
      estado: lido.estado,
      destino,
      iniciadaEm: typeof lido.iniciadaEm === "number" ? lido.iniciadaEm : null,
      origemDoDestino: lido.origemDoDestino === "externo" ? "externo" : "manual",
    };
  } catch {
    return { ...VIAGEM_INICIAL };
  }
}

export function salvarViagem(
  viagem: Viagem,
  store: ArmazenamentoSimples | null = armazenamentoDoNavegador(),
): void {
  if (!store) return;
  try {
    if (viagem.estado === "ocioso") store.removeItem(CHAVE_VIAGEM);
    else store.setItem(CHAVE_VIAGEM, JSON.stringify(viagem));
  } catch {
    /* sem persistência: a viagem vale para esta sessão */
  }
}
