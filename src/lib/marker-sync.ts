/**
 * Reconciliação incremental de coleções no mapa.
 *
 * P0 RC5+: os marcadores de POI e de alerta eram destruídos e recriados por
 * inteiro a cada atualização de props. Numa WebView de celular intermediário
 * isso é churn de memória gráfica durante a viagem — objetos do Google Maps
 * criados e coletados aos milhares.
 *
 * Esta função é pura de propósito: o plano é calculado e testado sem Google
 * Maps, e o componente só executa criar/atualizar/remover.
 */
export interface PlanoDeReconciliacao<T> {
  /** Não existiam: precisam de um objeto novo no mapa. */
  criar: T[];
  /** Já existem e mudaram: reaproveitar o objeto e atualizar o conteúdo. */
  atualizar: T[];
  /** Já existem e não mudaram: não tocar. */
  manter: string[];
  /** Sumiram da lista: remover apenas estes. */
  remover: string[];
}

export function planejarReconciliacao<T>(
  existentes: ReadonlyMap<string, string>,
  proximos: readonly T[],
  id: (item: T) => string,
  chave: (item: T) => string,
): PlanoDeReconciliacao<T> {
  const plano: PlanoDeReconciliacao<T> = { criar: [], atualizar: [], manter: [], remover: [] };
  const vistos = new Set<string>();
  for (const item of proximos) {
    const chaveId = id(item);
    if (vistos.has(chaveId)) continue; // lista duplicada não vira marcador duplicado
    vistos.add(chaveId);
    const anterior = existentes.get(chaveId);
    if (anterior === undefined) plano.criar.push(item);
    else if (anterior !== chave(item)) plano.atualizar.push(item);
    else plano.manter.push(chaveId);
  }
  for (const chaveId of existentes.keys()) {
    if (!vistos.has(chaveId)) plano.remover.push(chaveId);
  }
  return plano;
}

/** Chave de conteúdo: muda somente quando algo visível no marcador muda. */
export function chaveDePonto(p: {
  lat: number;
  lng: number;
  tipo?: string | null;
  titulo?: string | null;
}): string {
  return [p.lat.toFixed(6), p.lng.toFixed(6), p.tipo ?? "", p.titulo ?? ""].join("|");
}
