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
      }
      // Não existe mais caminho de INSERT em sos_events pelo cliente: um SOS
      // só nasce por sos_open, que valida a coordenada, exige request_id e
      // garante um único alerta ativo. Registrar um "histórico de SOS" por
      // fora criaria um evento com status active sem nada disso.
      // "share" é efêmero; nada a persistir no servidor.
    },
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // sos_events é somente-leitura para o cliente. Apagar o próprio
      // histórico continua sendo um direito, então passa pela RPC — que
      // preserva um SOS ainda ativo em vez de sumir com uma emergência.
      const [{ error: erroViagens }, { error: erroSos }] = await Promise.all([
        supabase.from("trips").delete().eq("user_id", user.id),
        supabase.rpc("sos_purge_history"),
      ]);
      if (erroViagens || erroSos) {
        throw new Error("Não foi possível limpar todo o histórico. Tente de novo.");
      }
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
