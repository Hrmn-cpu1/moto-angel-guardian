import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, ExternalLink, MapPin, Phone } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/benefits")({
  head: () => ({
    meta: [
      { title: "Parceiros e Benefícios — Moto Anjo" },
      {
        name: "description",
        content: "Descontos exclusivos em oficinas, postos e equipamentos para membros Moto Anjo.",
      },
      { property: "og:title", content: "Parceiros e Benefícios — Moto Anjo" },
      {
        property: "og:description",
        content: "Descontos exclusivos em oficinas, postos e equipamentos para membros Moto Anjo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BenefitsPage,
});

interface Partner {
  id: string;
  name: string;
  category: string;
  benefit: string;
  detail: string | null;
  featured: boolean;
}

function BenefitsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["partners"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Partner[]> => {
      const { data, error } = await supabase
        .from("partners")
        .select("id,name,category,benefit,detail,featured")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const partners = data ?? [];

  return (
    <AppShell>
      <Header back="/profile" title="Benefícios" subtitle="Parceiros Moto Anjo" showBell />

      <div className="space-y-4 px-5 pt-4">
        <div className="glass-card rounded-xl p-5 text-center animate-fade-up">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
            <BadgePercent size={22} />
          </div>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
            Vantagens de ser Moto Anjo
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Apresente seu perfil no estabelecimento parceiro para garantir o desconto.
          </p>
        </div>

        {isLoading && (
          <p className="py-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Carregando parceiros...
          </p>
        )}

        <div className="space-y-3 pb-4">
          {partners.map((p) => (
            <article
              key={p.id}
              className={`glass-card rounded-xl p-4 animate-fade-up ${
                p.featured ? "border-gold/45" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {p.category}
                  </p>
                  <h2 className="mt-0.5 truncate text-sm font-bold text-foreground">{p.name}</h2>
                </div>
                <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gold">
                  {p.benefit}
                </span>
              </div>
              {p.detail && (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-gold" /> {p.detail}
                </p>
              )}
              {p.featured && (
                <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-gold">
                  Parceiro destaque
                </p>
              )}
            </article>
          ))}

          {!isLoading && partners.length === 0 && (
            <div className="glass-card rounded-xl p-6 text-center text-xs text-muted-foreground">
              Nenhum parceiro disponível no momento.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}