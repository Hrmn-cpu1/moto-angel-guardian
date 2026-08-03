import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(100).max(20000).default(3000),
});

export type POIType = "hospital" | "fuel" | "shop" | "police" | "anjo";

export interface POI {
  id: string;
  name: string;
  type: POIType;
  lat: number;
  lng: number;
  address?: string;
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

async function nearby(
  apiKey: string,
  lovableKey: string,
  lat: number,
  lng: number,
  radius: number,
  includedTypes: string[],
  fallbackType: POIType,
): Promise<POI[]> {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Places nearby failed [${res.status}]: ${body}`);
    return [];
  }
  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }>;
  };
  return (data.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? "Sem nome",
    type: fallbackType,
    lat: p.location?.latitude ?? lat,
    lng: p.location?.longitude ?? lng,
    address: p.formattedAddress,
  }));
}

export const searchPOIs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !apiKey) {
      return { pois: [] as POI[], error: "missing_credentials" };
    }
    try {
      const [hospitals, fuel, shops, police] = await Promise.all([
        nearby(apiKey, lovableKey, data.lat, data.lng, data.radius, ["hospital"], "hospital"),
        nearby(apiKey, lovableKey, data.lat, data.lng, data.radius, ["gas_station"], "fuel"),
        nearby(apiKey, lovableKey, data.lat, data.lng, data.radius, ["car_repair"], "shop"),
        nearby(apiKey, lovableKey, data.lat, data.lng, data.radius, ["police"], "police"),
      ]);
      return { pois: [...hospitals, ...fuel, ...shops, ...police], error: null as string | null };
    } catch (e) {
      console.error("searchPOIs error", e);
      return { pois: [] as POI[], error: "request_failed" };
    }
  });
