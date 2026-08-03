import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RiskPoint {
  lat: number;
  lng: number;
  weight: number;
}

/**
 * Aggregated risk points (community incidents + SOS events) used to paint the
 * heatmap on the home map. Server-side function anonymises authorship.
 */
export function useRiskZones(pos: { lat: number; lng: number } | null, radiusKm = 25) {
  const query = useQuery({
    queryKey: [
      "risk-heatmap",
      pos ? pos.lat.toFixed(2) : "none",
      pos ? pos.lng.toFixed(2) : "none",
    ] as const,
    enabled: !!pos,
    staleTime: 120_000,
    refetchInterval: 300_000,
    retry: 1,
    queryFn: async (): Promise<RiskPoint[]> => {
      if (!pos) return [];
      const { data, error } = await supabase.rpc("risk_heatmap", {
        _lat: pos.lat,
        _lng: pos.lng,
        _radius_km: radiusKm,
        _days: 14,
      });
      if (error) throw error;
      return (data ?? []) as unknown as RiskPoint[];
    },
  });

  return { risks: query.data ?? [], loading: query.isLoading };
}