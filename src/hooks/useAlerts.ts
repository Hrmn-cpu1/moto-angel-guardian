import { useCallback, useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AlertType = "perigo" | "acidente" | "bloqueio" | "roubo";

export interface NearbyAlert {
  id: string;
  type: AlertType;
  title: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  created_at: string;
  author_name: string;
  distance_km: number;
  is_mine: boolean;
}

export const ALERT_LABEL: Record<AlertType, string> = {
  perigo: "Perigo",
  acidente: "Acidente",
  bloqueio: "Bloqueio",
  roubo: "Roubo",
};

export function alertsKey(lat?: number, lng?: number) {
  return [
    "nearby-alerts",
    lat != null ? lat.toFixed(2) : "none",
    lng != null ? lng.toFixed(2) : "none",
  ] as const;
}

export function useAlerts(pos: { lat: number; lng: number } | null, radiusKm = 25) {
  const qc = useQueryClient();
  const key = alertsKey(pos?.lat, pos?.lng);
  const instanceId = useId();

  const query = useQuery({
    queryKey: key,
    enabled: !!pos,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<NearbyAlert[]> => {
      if (!pos) return [];
      const { data, error } = await supabase.rpc("nearby_alerts", {
        _lat: pos.lat,
        _lng: pos.lng,
        _radius_km: radiusKm,
        _hours: 24,
      });
      if (error) throw error;
      return (data ?? []) as unknown as NearbyAlert[];
    },
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["nearby-alerts"] });
  }, [qc]);

  useEffect(() => {
    const channel = supabase
      .channel(`community_alerts_feed:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_alerts" }, () => {
        invalidate();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [invalidate, instanceId]);

  const create = useMutation({
    mutationFn: async (input: {
      type: AlertType;
      title: string;
      description?: string;
      address?: string;
      lat: number;
      lng: number;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("community_alerts").insert({
        user_id: user.id,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        address: input.address ?? null,
        lat: input.lat,
        lng: input.lng,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    alerts: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    create,
    remove,
    refresh: invalidate,
  };
}