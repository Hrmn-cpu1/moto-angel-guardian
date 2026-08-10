/**
 * Validação de coordenadas usada antes de registrar um SOS ou publicar um alerta.
 * Rejeita valores impossíveis e o par (0,0) — a "Null Island", quase sempre
 * sinal de um GPS que falhou e devolveu zero em vez de erro.
 */
export interface Coordinate {
  lat: number;
  lng: number;
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // Null Island: descarta o zero-zero devolvido por GPS quebrado.
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Precisão aceitável para um acionamento de emergência, em metros. */
export const MAX_EMERGENCY_ACCURACY_M = 2000;

export function isAccurateEnoughForEmergency(accuracy?: number | null): boolean {
  if (accuracy == null) return true; // aparelho não informou; não dá para julgar
  return accuracy <= MAX_EMERGENCY_ACCURACY_M;
}

export function googleMapsUrl(c: Coordinate): string {
  return `https://maps.google.com/?q=${c.lat},${c.lng}`;
}
