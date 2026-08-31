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
 * LIMITE CONHECIDO (NOT PROVEN)
 * -----------------------------
 * `devicemotion` roda na WebView. Com a tela bloqueada por muito tempo o
 * Android pode suspender a WebView mesmo com o foreground service de pé: a
 * posição continua chegando pelo serviço, o acelerômetro pode parar. A
 * captura de aceleração dentro do `ViagemSeguraService` é trabalho separado
 * (P0.2) e está registrada como pendência física.
 */

import type { AmostraSensor } from "./crash-detection.ts";
import { assinarPosicao } from "./geo-watch.ts";
import { ouvirPosicaoNativa } from "./trip-service.ts";

/** Período mínimo entre amostras entregues (ms). ~5 Hz. */
export const PERIODO_AMOSTRA_MS = 200;

export type DisponibilidadeMovimento = "disponivel" | "sem_permissao" | "indisponivel";

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
let ouvinteMovimento: ((e: DeviceMotionEvent) => void) | null = null;

/** Última leitura de cada fonte. O motor recebe as duas juntas. */
let ultimaVelocidadeKmh: number | null = null;
let ultimaPrecisaoM: number | null = null;
let ultimoAccel: number | null = null;
let ultimoGyro: number | null = null;
let ultimaEntrega = 0;

export function movimentoDisponivel(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** iOS pede permissão explícita; Android concede por padrão. */
export async function pedirPermissaoDeMovimento(): Promise<DisponibilidadeMovimento> {
  if (!movimentoDisponivel()) return "indisponivel";
  const ctor = (window as unknown as { DeviceMotionEvent: { requestPermission?: () => Promise<string> } })
    .DeviceMotionEvent;
  if (typeof ctor.requestPermission !== "function") return "disponivel";
  try {
    return (await ctor.requestPermission()) === "granted" ? "disponivel" : "sem_permissao";
  } catch {
    return "sem_permissao";
  }
}

function entregar(agora: number) {
  if (agora - ultimaEntrega < PERIODO_AMOSTRA_MS) return;
  ultimaEntrega = agora;
  const amostra: AmostraSensor = {
    t: agora,
    speedKmh: ultimaVelocidadeKmh,
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

  if (movimentoDisponivel()) {
    ouvinteMovimento = (e: DeviceMotionEvent) => {
      const linear = moduloAceleracao(e.acceleration) ?? moduloAceleracao(e.accelerationIncludingGravity);
      if (linear != null) ultimoAccel = linear;
      const rot = moduloRotacao(e.rotationRate);
      if (rot != null) ultimoGyro = rot;
      entregar(Date.now());
    };
    window.addEventListener("devicemotion", ouvinteMovimento);
  }

  cancelarNativo = ouvirPosicaoNativa((p) => {
    ultimaVelocidadeKmh = p.velocidadeMs >= 0 ? p.velocidadeMs * 3.6 : null;
    ultimaPrecisaoM = p.precisaoM >= 0 ? p.precisaoM : null;
    entregar(Date.now());
  });

  cancelarGps = assinarPosicao({
    aoReceber: (pos) => {
      const c = pos.coords;
      if (c.speed != null && c.speed >= 0) ultimaVelocidadeKmh = c.speed * 3.6;
      if (typeof c.accuracy === "number") ultimaPrecisaoM = c.accuracy;
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
  ultimaVelocidadeKmh = null;
  ultimaPrecisaoM = null;
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
