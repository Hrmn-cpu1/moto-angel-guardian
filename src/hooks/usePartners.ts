import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

  const partners = query.data ?? [];

  return {
    partners,
    located: partners.filter((p) => p.lat != null && p.lng != null),
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}

export function filterPartners(partners: Partner[], filter: string): Partner[] {
  if (filter === "todos") return partners;
  if (filter === "destaque") return partners.filter((p) => p.featured);
  return partners.filter((p) => p.category === filter);
}
