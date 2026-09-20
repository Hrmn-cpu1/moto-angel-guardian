/** Validade e consolidação dos relatos recebidos da comunidade. */

export const ALERT_TTL_MS: Record<string, number> = {
  sos: 6 * 60 * 60 * 1000,
  roubo: 6 * 60 * 60 * 1000,
  perigo: 3 * 60 * 60 * 1000,
  acidente: 2 * 60 * 60 * 1000,
  bloqueio: 2 * 60 * 60 * 1000,
};

export interface AlertaParaPolitica {
  id: string;
  type: string;
  title: string;
  lat: number;
  lng: number;
  created_at: string;
  distance_km: number;
}

export type AlertaConsolidado<T> = T & {
  source: "comunidade" | "sos_moto_anjo";
  expires_at: string;
};

function tituloNormalizado(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distanciaKm(a: AlertaParaPolitica, b: AlertaParaPolitica): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function entradaValida(a: AlertaParaPolitica): boolean {
  return (
    typeof a.id === "string" &&
    typeof a.title === "string" &&
    a.title.trim().length > 0 &&
    Number.isFinite(a.lat) &&
    a.lat >= -90 &&
    a.lat <= 90 &&
    Number.isFinite(a.lng) &&
    a.lng >= -180 &&
    a.lng <= 180 &&
    !(a.lat === 0 && a.lng === 0) &&
    Number.isFinite(a.distance_km) &&
    a.distance_km >= 0
  );
}

/**
 * Remove dado inválido/vencido e consolida relatos praticamente iguais.
 * A fonte original continua no banco; isto apenas impede ruído no cockpit.
 */
export function consolidarAlertas<T extends AlertaParaPolitica>(
  alertas: readonly T[],
  now = Date.now(),
): Array<AlertaConsolidado<T>> {
  const aceitos: Array<AlertaConsolidado<T>> = [];
  const ordenados = [...alertas].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  for (const alerta of ordenados) {
    if (!entradaValida(alerta)) continue;
    const criadoEm = Date.parse(alerta.created_at);
    const ttl = ALERT_TTL_MS[alerta.type];
    if (!Number.isFinite(criadoEm) || !ttl) continue;
    const idade = now - criadoEm;
    if (idade < -5 * 60_000 || idade > ttl) continue;

    const duplicado = aceitos.some(
      (existente) =>
        alerta.type !== "sos" &&
        existente.type === alerta.type &&
        tituloNormalizado(existente.title) === tituloNormalizado(alerta.title) &&
        Math.abs(Date.parse(existente.created_at) - criadoEm) <= 30 * 60_000 &&
        distanciaKm(existente, alerta) <= 0.15,
    );
    if (duplicado) continue;

    aceitos.push({
      ...alerta,
      source: alerta.type === "sos" ? "sos_moto_anjo" : "comunidade",
      expires_at: new Date(criadoEm + ttl).toISOString(),
    });
  }
  return aceitos;
}
