import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export interface Partner {
  id: string;
  name: string;
  category: string;
  benefit: string;
  detail: string | null;
  featured: boolean;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

export const BENEFIT_FILTERS: { id: string; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "combustivel", label: "Combustível" },
  { id: "servicos", label: "Serviços" },
  { id: "pneus", label: "Pneus" },
  { id: "lavagem", label: "Lavagem" },
  { id: "seguro", label: "Seguro" },
  { id: "destaque", label: "Destaques" },
];

export function usePartners() {
  const query = useQuery({
    queryKey: ["partners"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Partner[]> => {
      const { data, error } = await supabase
        .from("partners")
        .select("id,name,category,benefit,detail,featured,logo_url,address,phone,lat,lng")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const partners = query.data ?? (VAZIO as Partner[]);
  const located = useMemo(
    () => partners.filter((p) => p.lat != null && p.lng != null),
    [partners],
  );

  return {
    partners,
    located,
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}

export function filterPartners(partners: Partner[], filter: string): Partner[] {
  if (filter === "todos") return partners;
  if (filter === "destaque") return partners.filter((p) => p.featured);
  return partners.filter((p) => p.category === filter);
}
