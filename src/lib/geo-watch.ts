/**
 * Fonte ÚNICA de `navigator.geolocation.watchPosition` para todo o app web.
 *
 * P0 RC5+: quatro consumidores (useGeolocation, useCockpitTelemetry,
 * useLiveShare, useRideTelemetry) abriam cada um o seu próprio watcher. Numa
 * WebView Android isso significa quatro assinaturas do provedor de GPS ao
 * mesmo tempo, quatro fluxos de callbacks e quatro cadeias de re-render — o
 * caminho mais curto para bateria, calor e morte do processo durante a viagem.
 *
 * Aqui existe UMA assinatura real. Os hooks passam a ser assinantes dela.
 *
 * O listener NATIVO do ViagemSeguraService continua separado de propósito:
 * ele é outra responsabilidade (posição com a tela apagada) e não passa pelo
 * `navigator`.
 */

import { registrarEventoDeViagem } from "./trip-diagnostics.ts";

export interface OpcoesAssinatura {
  aoReceber: (posicao: GeolocationPosition) => void;
  aoFalhar?: (erro: GeolocationPositionError) => void;
}

type Assinante = OpcoesAssinatura;

const assinantes = new Set<Assinante>();
let watchId: number | null = null;
let ultimaPosicao: GeolocationPosition | null = null;
let ultimaLeituraEm = 0;
let falhasConsecutivas = 0;
let reinicioTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let ouvindoCicloDeVida = false;

export const GPS_SEM_LEITURA_MS = 45_000;

/** Backoff curto no primeiro erro e limitado para não martelar o provedor. */
export function atrasoReinicioGps(falhas: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(0, falhas), 5));
}

/** Opções únicas: o watcher é compartilhado, então não há negociação por hook. */
const OPCOES: PositionOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 };

function geo(): Geolocation | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return navigator.geolocation;
}

function limparWatchReal(): void {
  if (watchId == null) return;
  geo()?.clearWatch(watchId);
  watchId = null;
}

function removerCicloDeVida(): void {
  if (!ouvindoCicloDeVida || typeof window === "undefined") return;
  window.removeEventListener("online", retomarSeNecessario);
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", retomarSeNecessario);
  }
  ouvindoCicloDeVida = false;
}

function retomarSeNecessario(): void {
  if (assinantes.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (watchId == null || Date.now() - ultimaLeituraEm > GPS_SEM_LEITURA_MS) {
    agendarReinicio();
  }
}

function instalarCicloDeVida(): void {
  if (ouvindoCicloDeVida || typeof window === "undefined") return;
  window.addEventListener("online", retomarSeNecessario);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", retomarSeNecessario);
  }
  ouvindoCicloDeVida = true;
}

function iniciarWatchdog(): void {
  if (watchdogTimer != null) return;
  watchdogTimer = setInterval(retomarSeNecessario, 15_000);
}

function agendarReinicio(): void {
  if (assinantes.size === 0 || reinicioTimer != null) return;
  limparWatchReal();
  falhasConsecutivas += 1;
  const atraso = atrasoReinicioGps(falhasConsecutivas - 1);
  registrarEventoDeViagem("gps.web.watch.retry", { detalhe: `${atraso}ms` });
  reinicioTimer = setTimeout(() => {
    reinicioTimer = null;
    iniciarSeNecessario();
  }, atraso);
}

function iniciarSeNecessario(): void {
  if (watchId != null || assinantes.size === 0) return;
  const g = geo();
  if (!g) return;
  ultimaLeituraEm = Date.now();
  try {
    watchId = g.watchPosition(
      (posicao) => {
        ultimaPosicao = posicao;
        ultimaLeituraEm = Date.now();
        falhasConsecutivas = 0;
        for (const a of [...assinantes]) {
          try {
            a.aoReceber(posicao);
          } catch {
            /* um assinante quebrado não derruba os outros nem o watcher */
          }
        }
      },
      (erro) => {
        for (const a of [...assinantes]) {
          try {
            a.aoFalhar?.(erro);
          } catch {
            /* idem */
          }
        }
        // Negação de permissão não se resolve repetindo. Falta de sinal e
        // timeout, sim: a assinatura da WebView pode morrer sem se recuperar.
        if (erro.code !== erro.PERMISSION_DENIED) agendarReinicio();
      },
      OPCOES,
    );
    instalarCicloDeVida();
    iniciarWatchdog();
    registrarEventoDeViagem("gps.web.watch.start");
  } catch {
    watchId = null;
    agendarReinicio();
  }
}

function pararSeVazio(): void {
  if (assinantes.size > 0) return;
  limparWatchReal();
  ultimaPosicao = null;
  ultimaLeituraEm = 0;
  falhasConsecutivas = 0;
  if (reinicioTimer != null) clearTimeout(reinicioTimer);
  reinicioTimer = null;
  if (watchdogTimer != null) clearInterval(watchdogTimer);
  watchdogTimer = null;
  removerCicloDeVida();
  registrarEventoDeViagem("gps.web.watch.stop");
}

/**
 * Assina a posição compartilhada. Devolve o cancelador.
 *
 * O último fix conhecido é reentregue na hora da assinatura: um hook que monta
 * depois não fica cego esperando o próximo evento do GPS.
 */
export function assinarPosicao(opcoes: OpcoesAssinatura): () => void {
  const assinante: Assinante = opcoes;
  assinantes.add(assinante);
  iniciarSeNecessario();
  if (ultimaPosicao) {
    try {
      assinante.aoReceber(ultimaPosicao);
    } catch {
      /* ignorado: replay não pode virar erro de montagem */
    }
  }
  let cancelado = false;
  return () => {
    if (cancelado) return;
    cancelado = true;
    assinantes.delete(assinante);
    pararSeVazio();
  };
}

/** Quantos consumidores React estão pendurados na fonte compartilhada. */
export function totalDeAssinantes(): number {
  return assinantes.size;
}

/** Existe uma assinatura real de watchPosition aberta agora? */
export function watcherAtivo(): boolean {
  return watchId != null;
}

export function ultimaPosicaoConhecida(): GeolocationPosition | null {
  return ultimaPosicao;
}

/** Somente para teste: derruba o watcher e esquece os assinantes. */
export function __reiniciarGeoWatchParaTeste(): void {
  limparWatchReal();
  ultimaPosicao = null;
  ultimaLeituraEm = 0;
  falhasConsecutivas = 0;
  if (reinicioTimer != null) clearTimeout(reinicioTimer);
  reinicioTimer = null;
  if (watchdogTimer != null) clearInterval(watchdogTimer);
  watchdogTimer = null;
  removerCicloDeVida();
  assinantes.clear();
}
