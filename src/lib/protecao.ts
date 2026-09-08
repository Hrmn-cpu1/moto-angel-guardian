/**
 * O que a tela pode AFIRMAR sobre proteção.
 *
 * O serviço ativo não confirma sensores, capacidade de registrar SOS ou entrega
 * aos contatos. Este resumo afirma apenas que a viagem está ativa; o runtime
 * nativo informa separadamente o estado da proteção automática.
 */

export interface EntradaDeProtecao {
  sharing: boolean;
  gpsOnline: boolean;
  viagemAtiva: boolean;
  /** O aparelho tem o plugin do serviço (Android). */
  temServico: boolean;
  /** O Android confirmou que o serviço está de pé. */
  servicoAtivo: boolean;
}

export type RotuloDeProtecao = "Compartilhando" | "Viagem ativa" | "GPS ativo" | "Sem GPS";

export function rotuloDeProtecao(e: EntradaDeProtecao): RotuloDeProtecao {
  if (e.sharing) return "Compartilhando";
  if (e.viagemAtiva) return "Viagem ativa";
  if (!e.gpsOnline) return "Sem GPS";
  return "GPS ativo";
}

/* ================================================================== *
 * Reconciliação entre o estado JS da viagem e o serviço nativo (P1 §7)
 * ================================================================== */

export type EstadoNativo = "ativo" | "inativo" | "desconhecido";

export type AcaoDeReconciliacao =
  | "nada"
  /** JS acha que está protegido, o Android diz que não: tentar subir de novo. */
  | "tentar_recuperar"
  /** Já tentamos e continua fora: parar de prometer proteção. */
  | "declarar_desprotegido"
  /** O serviço está de pé sem viagem no JS: derrubar o órfão. */
  | "parar_orfao";

export function reconciliarViagem(entrada: {
  viagemAtiva: boolean;
  nativo: EstadoNativo;
  /** Já houve uma tentativa de recuperação nesta sessão de viagem. */
  jaTentouRecuperar: boolean;
  temServico: boolean;
}): AcaoDeReconciliacao {
  if (!entrada.temServico) return "nada";
  if (entrada.viagemAtiva && entrada.nativo === "inativo") {
    return entrada.jaTentouRecuperar ? "declarar_desprotegido" : "tentar_recuperar";
  }
  if (!entrada.viagemAtiva && entrada.nativo === "ativo") return "parar_orfao";
  // JS ativa + nativo ativo, JS ociosa + nativo inativo, ou estado
  // desconhecido (não inventamos conclusão a partir da ignorância).
  return "nada";
}
