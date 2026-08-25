import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapearRotaDaResposta, statusDeFalhaHttp, type RotaCalculada } from "@/lib/rota";

/**
 * Rota e busca de destino pelo servidor.
 *
 * A chave de navegador do projeto autoriza apenas Maps JavaScript e Places
 * (New); Directions responde REQUEST_DENIED (provado no site publicado). A
 * chave de servidor do conector, essa sim, atende Routes e Places — então o
 * cálculo mora aqui e o mapa só desenha.
 *
 * Toda chamada exige sessão: são chamadas cobradas por uso, e um endpoint
 * aberto viraria proxy do Google Maps para a internet inteira.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const EntradaRota = z.object({
  origem: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  destino: z.object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    endereco: z.string().trim().min(3).max(300).optional(),
  }),
});

export interface RespostaDeRota {
  ok: boolean;
  rota: RotaCalculada | null;
  /** Status no vocabulário do Directions (REQUEST_DENIED, ZERO_RESULTS...). */
  status: string | null;
}

const CAMPOS_ROTA = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.endLocation",
  "routes.legs.steps.navigationInstruction",
].join(",");

export const calcularRota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((entrada: unknown) => EntradaRota.parse(entrada))
  .handler(async ({ data }): Promise<RespostaDeRota> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !apiKey) {
      return { ok: false, rota: null, status: "REQUEST_DENIED" };
    }

    const temCoordenada = data.destino.lat != null && data.destino.lng != null;
    if (!temCoordenada && !data.destino.endereco) {
      return { ok: false, rota: null, status: "INVALID_REQUEST" };
    }

    const destino = temCoordenada
      ? { location: { latLng: { latitude: data.destino.lat!, longitude: data.destino.lng! } } }
      : { address: data.destino.endereco! };

    try {
      const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": CAMPOS_ROTA,
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.origem.lat, longitude: data.origem.lng } } },
          destination: destino,
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "pt-BR",
          units: "METRIC",
        }),
      });

      if (!res.ok) {
        const corpo = await res.text();
        console.error(`Routes computeRoutes falhou [${res.status}]: ${corpo}`);
        return { ok: false, rota: null, status: statusDeFalhaHttp(res.status, corpo) };
      }

      const json = await res.json();
      const rota = mapearRotaDaResposta(json, temCoordenada ? null : data.destino.endereco!);
      if (!rota) return { ok: false, rota: null, status: "ZERO_RESULTS" };
      return { ok: true, rota, status: "OK" };
    } catch (e) {
      console.error("calcularRota erro", e);
      return { ok: false, rota: null, status: "UNKNOWN_ERROR" };
    }
  });

const EntradaBusca = z.object({
  consulta: z.string().trim().min(3).max(200),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export interface LugarEncontrado {
  id: string;
  nome: string;
  endereco: string | null;
  lat: number;
  lng: number;
}

/**
 * Busca de endereço/local para escolher destino DENTRO do app.
 *
 * `searchText` da Places API (New) — pelo gateway, com a chave de servidor. O
 * resultado já traz coordenada, então o destino nasce com lat/lng e a rota não
 * depende de geocodificação depois.
 */
export const buscarLugares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((entrada: unknown) => EntradaBusca.parse(entrada))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !apiKey) {
      return { lugares: [] as LugarEncontrado[], erro: "missing_credentials" as string | null };
    }
    try {
      const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: data.consulta,
          languageCode: "pt-BR",
          maxResultCount: 8,
          ...(data.lat != null && data.lng != null
            ? {
                locationBias: {
                  circle: {
                    center: { latitude: data.lat, longitude: data.lng },
                    radius: 50000,
                  },
                },
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const corpo = await res.text();
        console.error(`Places searchText falhou [${res.status}]: ${corpo}`);
        return { lugares: [] as LugarEncontrado[], erro: "request_failed" as string | null };
      }
      const json = (await res.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
        }>;
      };
      const lugares: LugarEncontrado[] = (json.places ?? [])
        .map((p, i) => ({
          id: p.id ?? `lugar-${i}`,
          nome: p.displayName?.text ?? p.formattedAddress ?? "Sem nome",
          endereco: p.formattedAddress ?? null,
          lat: p.location?.latitude ?? NaN,
          lng: p.location?.longitude ?? NaN,
        }))
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));
      return { lugares, erro: null as string | null };
    } catch (e) {
      console.error("buscarLugares erro", e);
      return { lugares: [] as LugarEncontrado[], erro: "request_failed" as string | null };
    }
  });
