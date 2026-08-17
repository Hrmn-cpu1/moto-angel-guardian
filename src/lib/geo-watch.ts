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

/** Opções únicas: o watcher é compartilhado, então não há negociação por hook. */
const OPCOES: PositionOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 };

function geo(): Geolocation | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return navigator.geolocation;
}

function iniciarSeNecessario(): void {
  if (watchId != null) return;
  const g = geo();
  if (!g) return;
  watchId = g.watchPosition(
    (posicao) => {
      ultimaPosicao = posicao;
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
    },
    OPCOES,
  );
  registrarEventoDeViagem("gps.web.watch.start");
}

function pararSeVazio(): void {
  if (assinantes.size > 0 || watchId == null) return;
  geo()?.clearWatch(watchId);
  watchId = null;
  ultimaPosicao = null;
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
  if (watchId != null) geo()?.clearWatch(watchId);
  watchId = null;
  ultimaPosicao = null;
  assinantes.clear();
}
