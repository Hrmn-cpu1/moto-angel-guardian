import { mapearRotaDaResposta, type RotaCalculada } from "./rota.ts";

/**
 * A Routes API é uma fonte externa. Uma polilinha truncada pode ser decodificada
 * parcialmente pelo parser legado e parecer uma rota válida no cockpit.
 * Verificamos a integridade do formato ANTES de aceitar o traçado.
 */
function polilinhaCompleta(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length < 4 || valor.length > 250_000) return false;

  let componentes = 0;
  let grupos = 0;
  for (let i = 0; i < valor.length; i++) {
    const byte = valor.charCodeAt(i) - 63;
    if (byte < 0 || byte > 63) return false;
    grupos++;
    // Deltas de latitude/longitude usam inteiros de 32 bits.
    if (grupos > 7) return false;
    if (byte < 0x20) {
      componentes++;
      grupos = 0;
    }
  }

  // Cada ponto precisa de latitude E longitude; nada pode ficar pendente.
  return grupos === 0 && componentes >= 4 && componentes % 2 === 0;
}

function coordenadasValidas(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Conserva o parser existente, mas falha fechado para dados corrompidos.
 * Não inventa pontos, distâncias ou uma rota alternativa.
 */
export function mapearRotaValidada(
  resposta: unknown,
  destinoTexto: string | null = null,
): RotaCalculada | null {
  const rotas = (resposta as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(rotas)) return null;
  const primeira = rotas[0] as { polyline?: { encodedPolyline?: unknown } } | undefined;
  if (!polilinhaCompleta(primeira?.polyline?.encodedPolyline)) return null;

  const rota = mapearRotaDaResposta(resposta, destinoTexto);
  if (!rota || rota.pontos.length < 2) return null;
  if (!Number.isFinite(rota.distanciaM) || rota.distanciaM < 0) return null;
  if (!Number.isFinite(rota.duracaoS) || rota.duracaoS < 0) return null;
  if (rota.pontos.some(({ lat, lng }) => !coordenadasValidas(lat, lng))) return null;
  if (
    rota.passos.some(
      (passo) =>
        !Number.isFinite(passo.distanciaM) ||
        passo.distanciaM < 0 ||
        (passo.fim !== null && !coordenadasValidas(passo.fim.lat, passo.fim.lng)),
    )
  ) {
    return null;
  }
  return rota;
}
