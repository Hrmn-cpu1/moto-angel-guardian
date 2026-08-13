/**
 * Motor de detecção de possível queda.
 *
 * PLATAFORMA-INDEPENDENTE DE PROPÓSITO. Este arquivo não sabe o que é Android,
 * Capacitor, sensor ou permissão: recebe amostras normalizadas e devolve
 * estado. É o que permite testá-lo com séries sintéticas, sem moto, sem
 * aparelho e sem risco — e é o que permitirá reaproveitá-lo no iOS sem
 * reescrever a lógica.
 *
 * O QUE ESTE MOTOR NÃO FAZ
 * -----------------------
 * Não dispara SOS. Ele chega no máximo a `countdown`; quem decide acionar é a
 * camada de cima, que usa o MESMO `sos_open` do botão manual. Não existe
 * segundo pipeline de emergência.
 *
 * POR QUE NÃO UM LIMIAR SÓ
 * ------------------------
 * `if (inclinacao > 45) sos()` é o jeito errado. Uma moto inclina 45° numa
 * curva comum; um celular no bolso gira o tempo todo; frear forte derruba a
 * velocidade em 1 s; um buraco gera pico de aceleração. Cada um desses sinais,
 * sozinho, acontece dezenas de vezes por dia num turno normal — e um SOS falso
 * é caro: queima a confiança do motoboy e o contato de emergência para de
 * atender.
 *
 * A assinatura que interessa é uma SEQUÊNCIA:
 *
 *   1. o veículo estava em movimento;
 *   2. houve impacto (pico de aceleração) OU rotação brusca;
 *   3. a velocidade caiu para perto de zero;
 *   4. e ficou imóvel depois disso, por alguns segundos.
 *
 * Os passos 2 e 3 precisam acontecer perto no tempo. O passo 4 é o que separa
 * "caiu" de "frenagem brusca com sinal ruim": depois de uma freada, a pessoa
 * volta a andar.
 *
 * ESTADOS
 *
 *   normal -> anomaly -> candidate -> countdown -> (cancelled | sos)
 *
 *   normal     nada de anormal
 *   anomaly    impacto ou rotação vistos, aguardando o resto da assinatura
 *   candidate  assinatura fechada, confirmando imobilidade
 *   countdown  imobilidade confirmada: a UI pergunta "você está bem?"
 *   cancelled  a pessoa respondeu que está bem
 *   sos        ninguém respondeu, ou a pessoa pediu socorro
 */

export type EstadoQueda = "normal" | "anomaly" | "candidate" | "countdown" | "cancelled" | "sos";

/** Uma leitura já normalizada pela camada nativa. */
export interface AmostraSensor {
  /** Milissegundos, monotônico dentro de uma sessão. */
  t: number;
  /** Velocidade em km/h. `null` quando não há fix utilizável. */
  speedKmh: number | null;
  /** Módulo da aceleração linear em m/s² (sem gravidade). */
  accelMs2?: number | null;
  /** Módulo da velocidade angular em graus/s. */
  gyroDegS?: number | null;
  /** Precisão do fix em metros. Fix ruim não é usado para decidir. */
  accuracyM?: number | null;
}

export interface LimiaresQueda {
  /** Acima disto o veículo é considerado em movimento (km/h). */
  velocidadeMinima: number;
  /** Pico de aceleração que conta como impacto (m/s²). */
  impacto: number;
  /** Rotação brusca (graus/s). */
  rotacao: number;
  /** Abaixo disto consideramos parado (km/h). */
  velocidadeParado: number;
  /** Queda de velocidade que conta como brusca (km/h). */
  quedaVelocidade: number;
  /** Janela para impacto e queda de velocidade coincidirem (ms). */
  janelaAssinatura: number;
  /** Quanto tempo imóvel para confirmar (ms). */
  imobilidade: number;
  /** Precisão pior que isto não decide nada (m). */
  precisaoMaxima: number;
}

/**
 * Valores iniciais, escolhidos para errar para o lado de NÃO acionar.
 * Um falso negativo deixa o motoboy com o botão manual, que funciona. Um falso
 * positivo manda socorro para quem está bem e ensina todo mundo a ignorar o
 * alarme. Estes números precisam de validação com dados reais antes de
 * qualquer promessa — estão documentados como ponto de calibração.
 */
export const LIMIARES_PADRAO: LimiaresQueda = {
  velocidadeMinima: 15,
  impacto: 25,
  rotacao: 250,
  velocidadeParado: 3,
  quedaVelocidade: 12,
  janelaAssinatura: 4000,
  imobilidade: 6000,
  precisaoMaxima: 50,
};

export interface ResultadoQueda {
  estado: EstadoQueda;
  /** Por que o motor está nesse estado. Vai para o modo diagnóstico. */
  motivo: string;
  /** Sinais que já bateram nesta sequência. */
  sinais: string[];
}

interface Memoria {
  estado: EstadoQueda;
  velocidadeMax: number;
  tImpacto: number | null;
  tQueda: number | null;
  tImovel: number | null;
  sinais: Set<string>;
}

export class CrashDetectionEngine {
  private lim: LimiaresQueda;
  private mem: Memoria;
  private anterior: AmostraSensor | null = null;

  constructor(limiares: Partial<LimiaresQueda> = {}) {
    this.lim = { ...LIMIARES_PADRAO, ...limiares };
    this.mem = this.zerar();
  }

  private zerar(): Memoria {
    return {
      estado: "normal",
      velocidadeMax: 0,
      tImpacto: null,
      tQueda: null,
      tImovel: null,
      sinais: new Set(),
    };
  }

  /** Volta ao início. Usado ao encerrar viagem ou depois de resolver um alerta. */
  reset(): void {
    this.mem = this.zerar();
    this.anterior = null;
  }

  get estado(): EstadoQueda {
    return this.mem.estado;
  }

  /** A pessoa respondeu que está bem. */
  cancelar(): ResultadoQueda {
    this.reset();
    this.mem.estado = "cancelled";
    return { estado: "cancelled", motivo: "cancelado pelo usuario", sinais: [] };
  }

  /** O countdown terminou sem resposta, ou a pessoa pediu socorro. */
  confirmar(): ResultadoQueda {
    this.mem.estado = "sos";
    return { estado: "sos", motivo: "confirmado", sinais: [...this.mem.sinais] };
  }

  private resultado(motivo: string): ResultadoQueda {
    return { estado: this.mem.estado, motivo, sinais: [...this.mem.sinais] };
  }

  /**
   * Processa uma amostra. Estados terminais (`countdown`, `cancelled`, `sos`)
   * não são alterados por sensor: quem sai deles é a interface.
   */
  processar(a: AmostraSensor): ResultadoQueda {
    const m = this.mem;
    if (m.estado === "countdown" || m.estado === "cancelled" || m.estado === "sos") {
      return this.resultado("aguardando resposta da interface");
    }

    // Fix ruim não decide nada. Melhor ficar cego um instante do que acionar
    // socorro por causa de GPS pulando entre prédios.
    const fixConfiavel = a.accuracyM == null || a.accuracyM <= this.lim.precisaoMaxima;
    const anterior = this.anterior;
    this.anterior = a;

    if (a.speedKmh != null && fixConfiavel) {
      m.velocidadeMax = Math.max(m.velocidadeMax, a.speedKmh);
    }

    // Sem ter estado em movimento, não existe queda de moto para detectar.
    const estavaEmMovimento = m.velocidadeMax >= this.lim.velocidadeMinima;

    const impacto = (a.accelMs2 ?? 0) >= this.lim.impacto;
    const rotacao = (a.gyroDegS ?? 0) >= this.lim.rotacao;

    if ((impacto || rotacao) && estavaEmMovimento) {
      if (impacto) m.sinais.add("impacto");
      if (rotacao) m.sinais.add("rotacao");
      m.tImpacto = a.t;
      if (m.estado === "normal") m.estado = "anomaly";
    }

    // Queda brusca de velocidade, com fix utilizável dos dois lados.
    if (
      anterior?.speedKmh != null &&
      a.speedKmh != null &&
      fixConfiavel &&
      (anterior.accuracyM == null || anterior.accuracyM <= this.lim.precisaoMaxima)
    ) {
      const delta = anterior.speedKmh - a.speedKmh;
      if (
        delta >= this.lim.quedaVelocidade &&
        a.speedKmh <= this.lim.velocidadeParado &&
        estavaEmMovimento
      ) {
        m.sinais.add("queda-de-velocidade");
        m.tQueda = a.t;
        if (m.estado === "normal") m.estado = "anomaly";
      }
    }

    // A assinatura só fecha com impacto/rotação E parada, perto no tempo.
    if (m.tImpacto != null && m.tQueda != null) {
      const juntos = Math.abs(m.tImpacto - m.tQueda) <= this.lim.janelaAssinatura;
      if (juntos && m.estado === "anomaly") {
        m.estado = "candidate";
        m.tImovel = a.t;
      }
    }

    if (m.estado === "candidate") {
      const parado = a.speedKmh == null || a.speedKmh <= this.lim.velocidadeParado;
      if (!parado) {
        // Voltou a andar: era freada, buraco ou ruído. Sem alarme.
        this.mem = this.zerar();
        this.mem.velocidadeMax = a.speedKmh ?? 0;
        return this.resultado("voltou a se mover: assinatura descartada");
      }
      if (m.tImovel != null && a.t - m.tImovel >= this.lim.imobilidade) {
        m.estado = "countdown";
        m.sinais.add("imobilidade");
        return this.resultado("possivel queda: impacto/rotacao + parada + imobilidade");
      }
      return this.resultado("confirmando imobilidade");
    }

    // Anomalia isolada envelhece: sem o resto da assinatura, volta ao normal.
    if (m.estado === "anomaly" && m.tImpacto != null) {
      const idade = a.t - Math.max(m.tImpacto, m.tQueda ?? m.tImpacto);
      if (idade > this.lim.janelaAssinatura * 2) {
        this.mem = this.zerar();
        this.mem.velocidadeMax = a.speedKmh ?? 0;
        return this.resultado("anomalia isolada expirou");
      }
    }

    return this.resultado(m.estado === "normal" ? "normal" : "aguardando assinatura");
  }

  /** Roda uma série inteira. Usado nos testes e no modo diagnóstico. */
  processarSerie(amostras: AmostraSensor[]): ResultadoQueda {
    let ultimo: ResultadoQueda = { estado: "normal", motivo: "serie vazia", sinais: [] };
    for (const a of amostras) ultimo = this.processar(a);
    return ultimo;
  }
}

/* ================================================================== *
 * Countdown
 * ================================================================== */

export const COUNTDOWN_PADRAO_S = 15;

/** Quanto falta, em segundos. Pura, para a UI e o teste concordarem. */
export function segundosRestantes(
  inicioMs: number,
  agoraMs: number,
  totalS = COUNTDOWN_PADRAO_S,
): number {
  const passados = Math.floor((agoraMs - inicioMs) / 1000);
  return Math.max(0, totalS - passados);
}

export function countdownTerminou(
  inicioMs: number,
  agoraMs: number,
  totalS = COUNTDOWN_PADRAO_S,
): boolean {
  return segundosRestantes(inicioMs, agoraMs, totalS) === 0;
}

/* ================================================================== *
 * Decisão de acionar
 * ================================================================== */

export interface ContextoAcionamento {
  /** O usuário ligou a detecção automática? */
  deteccaoLigada: boolean;
  /** Modo diagnóstico: lê sensores, mostra tudo, NUNCA aciona. */
  modoDiagnostico: boolean;
  /** Já existe SOS ativo? Então não abrimos outro. */
  sosAtivo: boolean;
  estado: EstadoQueda;
}

export interface DecisaoAcionamento {
  acionar: boolean;
  motivo: string;
  /** Vai para `sos_events.source`. O pipeline é o mesmo do botão manual. */
  origem: "automatic_crash_detection" | null;
}

/**
 * A única porta entre o motor e o SOS real.
 *
 * O modo diagnóstico é verificado ANTES de qualquer outra coisa: é o que
 * garante que uma sessão de teste com o telefone na mão nunca mande socorro,
 * nunca crie alerta comunitário e nunca mande WhatsApp.
 */
export function decidirAcionamento(ctx: ContextoAcionamento): DecisaoAcionamento {
  if (ctx.modoDiagnostico) {
    return { acionar: false, motivo: "modo diagnostico: nenhum SOS e enviado", origem: null };
  }
  if (!ctx.deteccaoLigada) {
    return { acionar: false, motivo: "deteccao automatica desligada", origem: null };
  }
  if (ctx.estado !== "sos") {
    return { acionar: false, motivo: `estado ${ctx.estado} nao aciona`, origem: null };
  }
  if (ctx.sosAtivo) {
    return { acionar: false, motivo: "ja existe um SOS ativo", origem: null };
  }
  return {
    acionar: true,
    motivo: "queda confirmada sem resposta",
    origem: "automatic_crash_detection",
  };
}
