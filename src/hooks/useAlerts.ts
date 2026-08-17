import { useCallback, useEffect, useId , useMemo} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { registrarPresenca } from "@/lib/presence";

/**
 * Referências estáveis (RC7).
 *
 * `?? []` cria um array NOVO a cada render. Como esses valores descem para o
 * mapa, cada render invalidava os `useMemo` da Home e o mapa reconciliava
 * marcadores sem que nada tivesse mudado — churn de objetos na WebView, que é
 * exatamente o padrão associado ao travamento em aparelho. Um array vazio
 * compartilhado e `useMemo` mantêm a identidade quando o conteúdo não mudou.
 */
const VAZIO: never[] = [];

/** Tipos que o motociclista pode publicar pela tela de alertas. */
export type AlertType = "perigo" | "acidente" | "bloqueio" | "roubo";

/**
 * O que pode CHEGAR do banco. "sos" nunca é criado pelo cliente: nasce de um
 * trigger em sos_events e é bloqueado pela RLS (RC2 checkpoint B).
 */
export type AlertKind = AlertType | "sos";

export interface NearbyAlert {
  id: string;
  type: AlertKind;
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

export const ALERT_LABEL: Record<AlertKind, string> = {
  perigo: "Perigo",
  acidente: "Acidente",
  bloqueio: "Bloqueio",
  roubo: "Roubo",
  sos: "SOS ativo",
};

/** Um SOS aberto tem prioridade sobre qualquer outro alerta na lista. */
export function ehSos(tipo: AlertKind): boolean {
  return tipo === "sos";
}

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
    // Fallback do Realtime (hotfix P0.4-A). A RLS passou a esconder o espelho
    // do SOS de terceiros, e o Realtime respeita RLS: o evento de um SOS de
    // outra pessoa não chega mais por postgres_changes. NÃO vamos reabrir o
    // SELECT para consertar isso — seria vazar posição de emergência para
    // manter a UI cômoda. Em vez disso, reconsultamos a RPC segura enquanto o
    // app está em uso. `refetchIntervalInBackground` fica falso: com a tela
    // desligada ou o app atrás, não gastamos bateria nem chamada.
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async (): Promise<NearbyAlert[]> => {
      if (!pos) return [];
      // nearby_alerts usa a posição registrada do viewer (P0.5-A).
      await registrarPresenca(pos);
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
    // O canal continua útil para alertas manuais, que seguem legíveis por
    // authenticated. Ele carrega apenas o gatilho de invalidação — os dados
    // vêm sempre da RPC filtrada, nunca do payload do canal.
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
    alerts: query.data ?? (VAZIO as NearbyAlert[]),
    loading: query.isLoading,
    error: query.error as Error | null,
    create,
    remove,
    refresh: invalidate,
  };
}
