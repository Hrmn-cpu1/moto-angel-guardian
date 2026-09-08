/**
 * Captura REAL de sensores para a detecção de queda.
 *
 * Este módulo é a ponte que faltava: `crash-detection.ts` era biblioteca sem
 * consumidor — o motor existia, tinha testes, e nenhum sensor o alimentava.
 * Aqui as leituras físicas viram `AmostraSensor` normalizada.
 *
 * PRINCÍPIOS
 * ----------
 * 1. UMA assinatura real de `devicemotion` para todo o app, como já é feito
 *    com o GPS em `geo-watch.ts`. Vários consumidores = vários listeners =
 *    bateria e calor durante a viagem.
 * 2. A velocidade NÃO vem do acelerômetro: vem do GPS. Preferimos a posição
 *    do serviço nativo (`ouvirPosicaoNativa`), que é a única que continua
 *    chegando com a tela apagada; o `watchPosition` compartilhado cobre o
 *    navegador e o aparelho sem o serviço.
 * 3. Nenhum dado simulado. Sem acelerômetro, `accelMs2`/`gyroDegS` são `null`
 *    e o motor simplesmente não fecha assinatura — o estado é honesto.
 *
 * FONTES DE MOVIMENTO (P0.1b)
 * ---------------------------
 * 1. NATIVA — `SensorEventListener` dentro do `ViagemSeguraService`. É a
 *    única que sobrevive à WebView suspensa com a tela apagada, e por isso
 *    tem prioridade absoluta.
 * 2. `devicemotion` — fallback para navegador e para aparelho sem o serviço.
 *    Enquanto houver amostra nativa recente, o `devicemotion` é ignorado:
 *    misturar as duas dobraria a taxa e embaralharia a linha do tempo.
 *
 * TEMPO
 * -----
 * A amostra nativa traz `SystemClock.elapsedRealtime` (monotônico). Ele é
 * ancorado UMA vez ao relógio local, então os intervalos entre amostras são
 * os do aparelho, não os do agendador da WebView.
 *
 * NOT PROVEN: o comportamento em Doze e com a tela bloqueada por longos
 * períodos só se comprova em aparelho físico.
 */

import type { AmostraSensor } from "./crash-detection.ts";
import { assinarPosicao } from "./geo-watch.ts";
import {
  consultarSensoresNativos,
  ouvirMovimentoNativo,
  ouvirPosicaoNativa,
  type SensoresNativos,
} from "./trip-service.ts";

/** Período mínimo entre amostras entregues (ms). ~5 Hz. */
export const PERIODO_AMOSTRA_MS = 200;

export type DisponibilidadeMovimento = "disponivel" | "sem_permissao" | "indisponivel";

export type FonteMovimento = "nenhuma" | "nativa" | "webview";

/**
 * Depois deste silêncio, a fonte nativa é considerada perdida e o
 * `devicemotion` volta a valer. Cinco períodos de amostra: tolerante a
 * engasgo, rápido o bastante para reconectar sem buraco perceptível.
 */
export const TIMEOUT_NATIVO_MS = 1000;

/** Módulo do vetor de aceleração linear (sem gravidade), em m/s². */
export function moduloAceleracao(
  a: { x?: number | null; y?: number | null; z?: number | null } | null | undefined,
): number | null {
  if (!a) return null;
  const { x, y, z } = a;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  return Math.sqrt(x * x + y * y + z * z);
}

/** Módulo da velocidade angular em graus/s. */
export function moduloRotacao(
  r: { alpha?: number | null; beta?: number | null; gamma?: number | null } | null | undefined,
): number | null {
  if (!r) return null;
  const { alpha, beta, gamma } = r;
  const v = [alpha, beta, gamma].filter((n): n is number => typeof n === "number");
  if (v.length === 0) return null;
  return Math.sqrt(v.reduce((s, n) => s + n * n, 0));
}

type Assinante = (a: AmostraSensor) => void;

const assinantes = new Set<Assinante>();
let ligado = false;
let cancelarGps: (() => void) | null = null;
let cancelarNativo: (() => void) | null = null;
let cancelarMovimentoNativo: (() => void) | null = null;
let ouvinteMovimento: ((e: DeviceMotionEvent) => void) | null = null;

/** Última leitura de cada fonte. O motor recebe as duas juntas. */
let ultimaVelocidadeKmh: number | null = null;
let ultimaPrecisaoM: number | null = null;
let ultimoGpsEm = 0;
let ultimoAccel: number | null = null;
let ultimoGyro: number | null = null;
let ultimaEntrega = 0;

/** Última amostra nativa recebida (relógio local) e âncora do monotônico. */
let ultimoNativoEm = 0;
let ancoraMonotonica: number | null = null;
let fonteAtual: FonteMovimento = "nenhuma";
let sensoresNativos: SensoresNativos = {
  aceleracao: false,
  giroscopio: false,
  capturando: false,
};

/** Qual fonte está alimentando o motor agora. */
export function fonteDeMovimento(): FonteMovimento {
  return fonteAtual;
}

/** O que o Android reportou sobre o hardware. */
export function sensoresNativosConhecidos(): SensoresNativos {
  return sensoresNativos;
}

function nativoRecente(agora: number): boolean {
  return ultimoNativoEm > 0 && agora - ultimoNativoEm < TIMEOUT_NATIVO_MS;
}

export function movimentoDisponivel(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** iOS pede permissão explícita; Android concede por padrão. */
export async function pedirPermissaoDeMovimento(): Promise<DisponibilidadeMovimento> {
  if (!movimentoDisponivel()) return "indisponivel";
  const ctor = (
    window as unknown as { DeviceMotionEvent: { requestPermission?: () => Promise<string> } }
  ).DeviceMotionEvent;
  if (typeof ctor.requestPermission !== "function") return "disponivel";
  try {
    return (await ctor.requestPermission()) === "granted" ? "disponivel" : "sem_permissao";
  } catch {
    return "sem_permissao";
  }
}

/**
 * `tempo` é a linha do tempo da amostra (monotônica quando vem do serviço) e
 * também o relógio do throttle — usar o relógio de parede aqui descartaria
 * amostras nativas legítimas que chegam em rajada pela ponte.
 */
function entregar(agora: number, tempo = agora) {
  if (tempo - ultimaEntrega < PERIODO_AMOSTRA_MS) return;
  ultimaEntrega = tempo;
  const amostra: AmostraSensor = {
    t: tempo,
    speedKmh: agora >= ultimoGpsEm && agora - ultimoGpsEm <= 15_000 ? ultimaVelocidadeKmh : null,
    accelMs2: ultimoAccel,
    gyroDegS: ultimoGyro,
    accuracyM: ultimaPrecisaoM,
  };
  for (const a of [...assinantes]) {
    try {
      a(amostra);
    } catch {
      /* um assinante quebrado não derruba a captura */
    }
  }
}

function ligar() {
  if (ligado) return;
  ligado = true;

  // Prioridade 1: sensores do serviço nativo.
  cancelarMovimentoNativo = ouvirMovimentoNativo((m) => {
    const agora = Date.now();
    if (ancoraMonotonica == null) ancoraMonotonica = agora - m.monotonicoMs;
    ultimoNativoEm = agora;
    fonteAtual = "nativa";
    if (m.accelMs2 >= 0) ultimoAccel = m.accelMs2;
    if (m.gyroDegS >= 0) ultimoGyro = m.gyroDegS;
    entregar(agora, m.monotonicoMs + ancoraMonotonica);
  });

  void consultarSensoresNativos().then((s) => {
    sensoresNativos = s;
  });

  // Prioridade 2: WebView. Só vale enquanto o nativo estiver calado.
  if (movimentoDisponivel()) {
    ouvinteMovimento = (e: DeviceMotionEvent) => {
      const agoraWeb = Date.now();
      // Nativo mandando: ignorar o duplicado em vez de somar duas fontes.
      if (nativoRecente(agoraWeb)) return;
      const linear =
        moduloAceleracao(e.acceleration) ?? moduloAceleracao(e.accelerationIncludingGravity);
      if (linear != null) ultimoAccel = linear;
      const rot = moduloRotacao(e.rotationRate);
      if (rot != null) ultimoGyro = rot;
      fonteAtual = "webview";
      entregar(agoraWeb);
    };
    window.addEventListener("devicemotion", ouvinteMovimento);
  }

  cancelarNativo = ouvirPosicaoNativa((p) => {
    ultimoGpsEm = p.quandoMs;
    ultimaVelocidadeKmh = p.velocidadeMs >= 0 ? p.velocidadeMs * 3.6 : null;
    ultimaPrecisaoM = p.precisaoM >= 0 ? p.precisaoM : null;
    entregar(Date.now());
  });

  cancelarGps = assinarPosicao({
    aoReceber: (pos) => {
      const c = pos.coords;
      ultimoGpsEm = pos.timestamp;
      ultimaVelocidadeKmh = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : null;
      ultimaPrecisaoM = typeof c.accuracy === "number" ? c.accuracy : null;
      entregar(Date.now());
    },
  });
}

function desligar() {
  if (!ligado) return;
  ligado = false;
  if (ouvinteMovimento) window.removeEventListener("devicemotion", ouvinteMovimento);
  ouvinteMovimento = null;
  cancelarGps?.();
  cancelarGps = null;
  cancelarNativo?.();
  cancelarNativo = null;
  cancelarMovimentoNativo?.();
  cancelarMovimentoNativo = null;
  ultimoNativoEm = 0;
  ancoraMonotonica = null;
  fonteAtual = "nenhuma";
  sensoresNativos = { aceleracao: false, giroscopio: false, capturando: false };
  ultimaVelocidadeKmh = null;
  ultimaPrecisaoM = null;
  ultimoGpsEm = 0;
  ultimoAccel = null;
  ultimoGyro = null;
  ultimaEntrega = 0;
}

/**
 * Assina as amostras normalizadas. Devolve o cancelador.
 *
 * A captura física começa no PRIMEIRO assinante e para quando o último sai —
 * iniciar/parar viagem várias vezes não empilha listeners.
 */
export function assinarSensoresDeQueda(cb: Assinante): () => void {
  assinantes.add(cb);
  ligar();
  let cancelado = false;
  return () => {
    if (cancelado) return;
    cancelado = true;
    assinantes.delete(cb);
    if (assinantes.size === 0) desligar();
  };
}

export function totalDeAssinantesDeQueda(): number {
  return assinantes.size;
}

export function capturaDeQuedaAtiva(): boolean {
  return ligado;
}

/** Somente para teste. */
export function __reiniciarSensoresDeQuedaParaTeste(): void {
  assinantes.clear();
  desligar();
}
