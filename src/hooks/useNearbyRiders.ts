import { useCallback, useEffect, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { registrarPresenca } from "@/lib/presence";
import type { OnlineRider } from "./useOnlineRiders";
import { CAMADAS_PADRAO, consultasHabilitadas, type CamadasDoMapa } from "@/lib/map-layers";

/**
 * Duas visibilidades diferentes, duas fontes diferentes (RC2 hotfix P0.3-C).
 *
 *   comunidade -> RPC online_riders: só quem ligou "aparecer para outros
 *                 motoqueiros". Contato autorizado NÃO fura esse opt-in.
 *   contatos   -> RPC trusted_contacts_online: quem o dono aprovou em
 *                 location_shares. É relação privada e continua funcionando
 *                 como antes do RC2, com ou sem opt-in comunitário.
 *
 * A lista combinada existe só para desenhar o mapa. Quando a mesma pessoa
 * aparece nas duas, ela conta como contato — o vínculo mais forte vence.
 */
export interface RiderNoMapa extends OnlineRider {
  origem: "contato" | "comunidade";
}

function comoRiders(dados: unknown[] | null): OnlineRider[] {
  return (dados ?? []) as OnlineRider[];
}

export function useNearbyRiders(
  pos: { lat: number; lng: number } | null,
  radiusKm = 50,
  camadas: CamadasDoMapa = CAMADAS_PADRAO,
) {
  // Nada de default implícito: o que vale é o controle da interface. Camada
  // desligada não consulta o servidor (hotfix P0.4-C).
  const habilitadas = consultasHabilitadas(camadas, !!pos);
  const verComunidade = habilitadas.comunidade;
  const verContatos = habilitadas.contatos;
  const qc = useQueryClient();
  const instanceId = useId();
  const chave = pos ? [pos.lat.toFixed(2), pos.lng.toFixed(2)] : ["none", "none"];

  const contatos = useQuery({
    queryKey: ["trusted-contacts-online", ...chave],
    enabled: verContatos,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<OnlineRider[]> => {
      if (!pos) return [];
      // A RPC usa a posição registrada do viewer como origem (P0.5-A).
      await registrarPresenca(pos);
      const { data, error } = await supabase.rpc("trusted_contacts_online", {
        _lat: pos.lat,
        _lng: pos.lng,
        _radius_km: radiusKm,
        _minutes: 10,
      });
      if (error) throw new Error(error.message);
      return comoRiders(data);
    },
  });

  const comunidade = useQuery({
    queryKey: ["online-riders", ...chave],
    enabled: verComunidade,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<OnlineRider[]> => {
      if (!pos) return [];
      await registrarPresenca(pos);
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
    void qc.invalidateQueries({ queryKey: ["trusted-contacts-online"] });
  }, [qc]);

  // Um único canal para as duas listas: nada de assinatura duplicada por tela.
  useEffect(() => {
    const canal = supabase
      .channel(`live_locations_feed:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => {
        invalidate();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [invalidate, instanceId]);

  const listaContatos = useMemo<RiderNoMapa[]>(
    () =>
      verContatos ? (contatos.data ?? []).map((r) => ({ ...r, origem: "contato" as const })) : [],
    [contatos.data, verContatos],
  );

  const listaComunidade = useMemo<RiderNoMapa[]>(
    () =>
      verComunidade
        ? (comunidade.data ?? []).map((r) => ({ ...r, origem: "comunidade" as const }))
        : [],
    [comunidade.data, verComunidade],
  );

  const todos = useMemo<RiderNoMapa[]>(() => {
    const porUsuario = new Map<string, RiderNoMapa>();
    for (const r of listaComunidade) porUsuario.set(r.user_id, r);
    for (const r of listaContatos) porUsuario.set(r.user_id, r); // contato vence
    return [...porUsuario.values()].sort((a, b) => a.distance_km - b.distance_km);
  }, [listaComunidade, listaContatos]);

  return {
    contatos: listaContatos,
    comunidade: listaComunidade,
    todos,
    loading: contatos.isLoading || comunidade.isLoading,
    error: (contatos.error ?? comunidade.error) as Error | null,
    refresh: invalidate,
  };
}
