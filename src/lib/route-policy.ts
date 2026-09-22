/** Política pura da Routes API: moto primeiro, carro apenas como fallback explícito. */

export type ModoGoogleRoutes = "TWO_WHEELER" | "DRIVE";
export type PerfilDeRota = "moto" | "carro_fallback";

export interface CoordenadaDeRota {
  lat: number;
  lng: number;
}

export type DestinoGoogleRoutes =
  { location: { latLng: { latitude: number; longitude: number } } } | { address: string };

export function corpoDaRota(
  origem: CoordenadaDeRota,
  destino: DestinoGoogleRoutes,
  travelMode: ModoGoogleRoutes,
) {
  return {
    origin: {
      location: { latLng: { latitude: origem.lat, longitude: origem.lng } },
    },
    destination: destino,
    travelMode,
    routingPreference: "TRAFFIC_AWARE" as const,
    languageCode: "pt-BR",
    units: "METRIC" as const,
  };
}

/** Não esconde chave negada, cota ou indisponibilidade geral atrás do fallback. */
export function permiteFallbackParaCarro(status: number, corpo: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const texto = corpo.toUpperCase();
  return (
    texto.includes("TWO_WHEELER") ||
    texto.includes("TRAVEL_MODE") ||
    texto.includes("TRAVEL MODE") ||
    texto.includes("ROUTE_NOT_FOUND") ||
    texto.includes("NO ROUTE")
  );
}

export function perfilDoModo(modo: ModoGoogleRoutes): PerfilDeRota {
  return modo === "TWO_WHEELER" ? "moto" : "carro_fallback";
}
