/**
 * Telemetria de pilotagem — velocidade, rumo, inclinação e modo.
 *
 * Tudo aqui é puro e independente de plataforma: recebe leitura, devolve
 * número tratado. Quem captura sensor é outra camada. É o que permite testar
 * o comportamento sem moto, sem aparelho e sem inventar dado.
 *
 * REGRA QUE VALE PARA O ARQUIVO INTEIRO: quando não há dado confiável, o
 * resultado é `null` e a interface mostra "—". Nunca um número bonito
 * fabricado. Num painel que a pessoa olha a 60 km/h, um valor inventado é
 * pior que um traço.
 */

/* ================================================================== *
 * Velocidade
 * ================================================================== */

export interface LeituraVelocidade {
  /** m/s vindo do GPS. `null` quando o fix não traz velocidade. */
  speedMs: number | null;
  /** Precisão do fix em metros. */
  accuracyM?: number | null;
}

/** Abaixo disto, GPS parado ainda oscila. Vira zero em vez de piscar. */
export const ZONA_MORTA_KMH = 3;
/** Fix pior que isto não vira velocidade na tela. */
export const PRECISAO_MAXIMA_M = 50;

/**
 * Converte e limpa. Devolve `null` quando não dá para afirmar nada.
 *
 * A zona morta existe por um motivo observável: parado num semáforo, o GPS
 * gera 0, 2, 0, 3, 1 km/h. Um painel piscando desses números diz ao
 * motociclista que o aparelho não sabe o que está fazendo.
 */
export function velocidadeKmh(l: LeituraVelocidade): number | null {
  if (l.speedMs == null || !Number.isFinite(l.speedMs) || l.speedMs < 0) return null;
  if (l.accuracyM != null && l.accuracyM > PRECISAO_MAXIMA_M) return null;
  const kmh = l.speedMs * 3.6;
  if (kmh < ZONA_MORTA_KMH) return 0;
  return Math.round(kmh);
}

/** Média móvel curta: tira o tremor sem criar atraso perceptível. */
export function suavizarVelocidade(historico: number[], nova: number, janela = 3): number {
  const serie = [...historico, nova].slice(-janela);
  return Math.round(serie.reduce((a, b) => a + b, 0) / serie.length);
}

/* ================================================================== *
 * Rumo
 * ================================================================== */

export type Cardeal = "N" | "NE" | "L" | "SE" | "S" | "SO" | "O" | "NO";
const CARDEAIS: Cardeal[] = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];

/**
 * Rumo em cardeal. `null` quando não é confiável.
 *
 * Parado, o heading do GPS gira sozinho — apontar "N, L, S, O" com a moto
 * imóvel é ruído apresentado como informação. Por isso exige movimento.
 */
export function rumoCardeal(
  headingGraus: number | null | undefined,
  velocidadeKmhAtual: number | null,
): Cardeal | null {
  if (headingGraus == null || !Number.isFinite(headingGraus)) return null;
  if (velocidadeKmhAtual == null || velocidadeKmhAtual < ZONA_MORTA_KMH * 2) return null;
  const normalizado = ((headingGraus % 360) + 360) % 360;
  const indice = Math.round(normalizado / 45) % 8;
  return CARDEAIS[indice];
}

/* ================================================================== *
 * Inclinação
 * ================================================================== */

export type ConfiancaInclinacao = "indisponivel" | "baixa" | "boa";

export interface Inclinacao {
  /** Graus. Negativo à esquerda, positivo à direita. `null` sem sensor. */
  graus: number | null;
  confianca: ConfiancaInclinacao;
  /** Texto honesto para a interface quando não há dado. */
  aviso: string | null;
}

export const INCLINACAO_MAXIMA = 45;

/**
 * Inclinação a partir do sensor de orientação.
 *
 * ATENÇÃO AO QUE ISTO É: o sensor mede a orientação DO TELEFONE, não da
 * motocicleta. Celular no bolso, no suporte torto ou na mochila dá números
 * que não têm relação com o ângulo real da moto. Por isso o valor sempre vem
 * acompanhado de confiança, e a interface precisa mostrar isso — chamar de
 * "inclinação da moto" seria mentira.
 *
 * Só é considerado confiável com o veículo em movimento: parado, girar o
 * celular na mão produziria leitura sem sentido.
 */
export function calcularInclinacao(
  gammaGraus: number | null | undefined,
  velocidadeKmhAtual: number | null,
): Inclinacao {
  if (gammaGraus == null || !Number.isFinite(gammaGraus)) {
    return { graus: null, confianca: "indisponivel", aviso: "sem sensor de orientação" };
  }
  const limitado = Math.max(-INCLINACAO_MAXIMA, Math.min(INCLINACAO_MAXIMA, Math.round(gammaGraus)));
  if (velocidadeKmhAtual == null || velocidadeKmhAtual < ZONA_MORTA_KMH) {
    return { graus: limitado, confianca: "baixa", aviso: "parado: leitura do aparelho" };
  }
  return { graus: limitado, confianca: "boa", aviso: null };
}

/**
 * Inclinação NUNCA decide queda.
 *
 * Existe porque é a confusão mais provável de alguém cometer ao ver o
 * indicador na tela: "inclinou 40°, caiu". Motociclista inclina em toda
 * curva. Queda é decidida pelo CrashDetectionEngine, que exige sequência de
 * sinais. Esta função é a barreira explícita, e tem teste.
 */
export function inclinacaoIndicaQueda(): false {
  return false;
}

/* ================================================================== *
 * Modo: parado × pilotando
 * ================================================================== */

export type ModoPilotagem = "parado" | "pilotando";

/** Sobe para pilotando acima disto. */
export const LIMIAR_ENTRAR_KMH = 12;
/** Só volta para parado abaixo disto. A distância entre os dois é a histerese. */
export const LIMIAR_SAIR_KMH = 5;
/** E ainda precisa ficar abaixo por este tempo. */
export const TEMPO_PARA_PARAR_MS = 8000;

export interface EstadoModo {
  modo: ModoPilotagem;
  /** Desde quando está devagar. `null` se não está. */
  desdeMs: number | null;
}

export const MODO_INICIAL: EstadoModo = { modo: "parado", desdeMs: null };

/**
 * Transição com histerese e tempo.
 *
 * Sem isso, o painel entra e sai do modo pilotagem a cada oscilação do GPS —
 * e um layout que troca sozinho na frente de quem está dirigindo é pior que
 * um layout errado.
 */
export function proximoModo(
  estado: EstadoModo,
  velocidade: number | null,
  agoraMs: number,
): EstadoModo {
  const v = velocidade ?? 0;

  if (estado.modo === "parado") {
    return v >= LIMIAR_ENTRAR_KMH ? { modo: "pilotando", desdeMs: null } : estado;
  }

  if (v >= LIMIAR_SAIR_KMH) return { modo: "pilotando", desdeMs: null };

  const desde = estado.desdeMs ?? agoraMs;
  if (agoraMs - desde >= TEMPO_PARA_PARAR_MS) return { modo: "parado", desdeMs: null };
  return { modo: "pilotando", desdeMs: desde };
}
