import type { PontoDaRota } from "./rota.ts";

/**
 * Recálculo automático de rota (desvio de caminho).
 *
 * O QUE ESTE MÓDULO É
 * A parte PURA da decisão "o motociclista saiu da rota?". Ele não tem GPS,
 * não chama o Google e não desenha nada: recebe a posição que o app já tem e
 * o traçado que o app já calculou, e responde se vale a pena pedir uma rota
 * nova. Quem pede a rota continua sendo o mesmo caminho de sempre
 * (`calcularRota` no servidor) — nenhum segundo motor de navegação.
 *
 * POR QUE COM HISTERESE
 * GPS urbano erra dezenas de metros perto de prédio e viaduto. Recalcular na
 * primeira leitura ruim faria a rota piscar e queimaria cota da Routes API.
 * Por isso: distância mínima, leituras consecutivas e tempo de espera entre
 * recálculos.
 */

/** Longe da linha o bastante para não ser erro comum de GPS. */
export const DESVIO_METROS = 45;
/** Leituras seguidas fora da rota antes de aceitar o desvio. */
export const LEITURAS_PARA_DESVIO = 3;
/** Nada de recalcular em rajada: um pedido por vez, com respiro. */
export const COOLDOWN_MS = 20_000;
/** Leitura muito imprecisa não serve de prova de desvio. */
export const PRECISAO_MAXIMA_M = 60;

const RAIO_TERRA_M = 6_371_000;

function rad(v: number): number {
  return (v * Math.PI) / 180;
}

/** Haversine. Metros entre dois pontos. */
export function distanciaEntre(a: PontoDaRota, b: PontoDaRota): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Distância do ponto ao segmento, em metros, com projeção local plana. */
export function distanciaAoSegmento(p: PontoDaRota, a: PontoDaRota, b: PontoDaRota): number {
  const escalaLng = Math.cos(rad(p.lat));
  const ax = a.lng * escalaLng;
  const ay = a.lat;
  const bx = b.lng * escalaLng;
  const by = b.lat;
  const px = p.lng * escalaLng;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const comprimento = dx * dx + dy * dy;
  if (comprimento === 0) return distanciaEntre(p, a);
  let t = ((px - ax) * dx + (py - ay) * dy) / comprimento;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: ay + t * dy, lng: (ax + t * dx) / escalaLng };
  return distanciaEntre(p, proj);
}

/**
 * Menor distância da posição ao traçado inteiro. `null` sem traçado usável —
 * sem rota não existe desvio, e inventar um número aqui viraria recálculo
 * eterno.
 */
export function distanciaDaRota(
  posicao: PontoDaRota | null | undefined,
  tracado: readonly PontoDaRota[] | null | undefined,
): number | null {
  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) return null;
  if (!Array.isArray(tracado) || tracado.length < 2) return null;
  let menor = Number.POSITIVE_INFINITY;
  for (let i = 0; i < tracado.length - 1; i++) {
    const d = distanciaAoSegmento(posicao, tracado[i], tracado[i + 1]);
    if (d < menor) menor = d;
  }
  return Number.isFinite(menor) ? menor : null;
}

export interface EstadoDeDesvio {
  /** Leituras válidas consecutivas fora da rota. */
  leiturasFora: number;
  /** Quando o último recálculo foi disparado (ms). 0 = nenhum ainda. */
  ultimoRecalculoMs: number;
}

export const DESVIO_INICIAL: EstadoDeDesvio = { leiturasFora: 0, ultimoRecalculoMs: 0 };

export interface LeituraDeDesvio {
  posicao: PontoDaRota | null;
  tracado: readonly PontoDaRota[] | null;
  /** Precisão do GPS em metros, quando conhecida. */
  precisaoM?: number | null;
  agoraMs: number;
}

export interface ResultadoDeDesvio {
  estado: EstadoDeDesvio;
  /** `true` somente quando o app deve pedir uma rota nova agora. */
  recalcular: boolean;
  /** Distância medida até a rota. `null` quando a leitura não vale. */
  distanciaM: number | null;
}

/**
 * Avalia UMA leitura de GPS contra a rota atual.
 *
 * Regras, nesta ordem: leitura imprecisa é ignorada; dentro da tolerância
 * zera o contador; fora, conta. Só com leituras consecutivas suficientes e
 * fora do cooldown a função pede recálculo.
 */
export function avaliarDesvio(
  estado: EstadoDeDesvio,
  leitura: LeituraDeDesvio,
): ResultadoDeDesvio {
  const distanciaM = distanciaDaRota(leitura.posicao, leitura.tracado);
  if (distanciaM == null) return { estado, recalcular: false, distanciaM: null };

  const precisao = leitura.precisaoM;
  if (typeof precisao === "number" && Number.isFinite(precisao) && precisao > PRECISAO_MAXIMA_M) {
    return { estado, recalcular: false, distanciaM };
  }

  if (distanciaM <= DESVIO_METROS) {
    return { estado: { ...estado, leiturasFora: 0 }, recalcular: false, distanciaM };
  }

  const leiturasFora = estado.leiturasFora + 1;
  const emCooldown =
    estado.ultimoRecalculoMs > 0 && leitura.agoraMs - estado.ultimoRecalculoMs < COOLDOWN_MS;
  if (leiturasFora < LEITURAS_PARA_DESVIO || emCooldown) {
    return { estado: { ...estado, leiturasFora }, recalcular: false, distanciaM };
  }

  return {
    estado: { leiturasFora: 0, ultimoRecalculoMs: leitura.agoraMs },
    recalcular: true,
    distanciaM,
  };
}
