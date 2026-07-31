import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnlineRider {
  user_id: string;
  name: string;
  avatar_url: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  updated_at: string;
  distance_km: number;
}

/**
 * Riders who opted in to live sharing (live_locations.sharing = true) and
 * pushed a position recently. Access is enforced server-side by the
 * `online_riders` function: only authenticated callers, never own row,
 * never e-mail/phone, and only riders who authorized the caller by adding
 * their phone number to their own emergency contacts list.
 */
export function useOnlineRiders(pos: { lat: number; lng: number } | null, radiusKm = 50) {
  const qc = useQueryClient();
  const key = [
    "online-riders",
    pos ? pos.lat.toFixed(2) : "none",
    pos ? pos.lng.toFixed(2) : "none",
  ] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!pos,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<OnlineRider[]> => {
      if (!pos) return [];
      const { data, error } = await supabase.rpc("online_riders", {
        _lat: pos.lat,
        _lng: pos.lng,
        _radius_km: radiusKm,
        _minutes: 10,
      });
      if (error) throw error;
      return (data ?? []) as unknown as OnlineRider[];
    },
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["online-riders"] });
  }, [qc]);

  useEffect(() => {
    const channel = supabase
      .channel("live_locations_feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => {
        invalidate();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [invalidate]);

  return {
    riders: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refresh: invalidate,
  };
}
