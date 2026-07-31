import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HistoryItem } from "@/types";

export const historyKey = ["history"] as const;

type HistoryRow = {
  id: string;
  kind: string;
  title: string;
  description: string;
  ts: string;
  meta: Record<string, unknown> | null;
};

// Single aggregated RPC replaces the previous pair of full table scans.
async function fetchHistory(): Promise<HistoryItem[]> {
  const { data, error } = await supabase.rpc("user_history", { _limit: 50 });
  if (error) throw error;
  return ((data ?? []) as HistoryRow[]).map((r) => ({
    id: r.id,
    type: r.kind as HistoryItem["type"],
    title: r.title,
    description: r.description,
    timestamp: r.ts,
    meta: (r.meta ?? {}) as HistoryItem["meta"],
  }));
}

export function useHistory() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: historyKey,
    queryFn: fetchHistory,
    staleTime: 30_000,
    retry: 2,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: historyKey });
  }, [qc]);

  const addMutation = useMutation({
    mutationFn: async (item: Omit<HistoryItem, "id" | "timestamp">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      if (item.type === "trip") {
        const meta = item.meta ?? {};
        const duration = Number(meta.duration ?? 0);
        const distance = Number(meta.distance ?? 0);
        const now = new Date();
        const started = new Date(now.getTime() - duration * 1000);
        await supabase.from("trips").insert({
          user_id: user.id,
          started_at: started.toISOString(),
          ended_at: now.toISOString(),
          duration_seconds: duration,
          distance_km: distance,
          avg_speed: duration > 0 ? distance / (duration / 3600) : 0,
          companion: (meta.companion as string) || null,
        });
      } else if (item.type === "sos") {
        const meta = item.meta ?? {};
        await supabase.from("sos_events").insert({
          user_id: user.id,
          latitude: meta.lat === "" ? null : Number(meta.lat),
          longitude: meta.lng === "" ? null : Number(meta.lng),
          address: item.description,
          note: (meta.note as string) || null,
          status: "active",
        });
      }
      // "share" events are ephemeral; nothing to persist server-side.
    },
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await Promise.all([
        supabase.from("trips").delete().eq("user_id", user.id),
        supabase.from("sos_events").delete().eq("user_id", user.id),
      ]);
    },
    onSuccess: () => qc.setQueryData(historyKey, [] as HistoryItem[]),
  });

  const add = useCallback(
    (item: Omit<HistoryItem, "id" | "timestamp">) => addMutation.mutateAsync(item),
    [addMutation],
  );
  const clear = useCallback(() => clearMutation.mutateAsync(), [clearMutation]);

  return { items: data ?? [], loading: isLoading, add, clear };
}
