import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgePercent, MapPin, Navigation } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { usePartners, filterPartners, BENEFIT_FILTERS } from "@/hooks/usePartners";

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

function BenefitsPage() {
  const { partners: all, loading: isLoading } = usePartners();
  const [filter, setFilter] = useState("todos");
  const partners = filterPartners(all, filter);

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
          <Link
            to="/map"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold"
          >
            <MapPin size={12} /> Ver parceiros no mapa
          </Link>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {BENEFIT_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition ${
                filter === f.id
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-white/10 bg-black/40 text-muted-foreground"
              }`}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <p className="py-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
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
              <div className="flex items-start gap-3">
                {p.logo_url ? (
                  <img
                    src={p.logo_url}
                    alt={`Logo ${p.name}`}
                    loading="lazy"
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-xl border border-gold/25 bg-black/50 object-contain p-1.5"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-black/50 text-gold">
                    <BadgePercent size={18} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {p.category}
                  </p>
                  <h2 className="mt-0.5 text-sm font-bold break-words text-foreground">{p.name}</h2>
                  {p.address && (
                    <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                      {p.address}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-center text-[10px] font-black uppercase tracking-wider text-gold">
                {p.benefit}
              </p>
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
              {p.lat != null && p.lng != null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full gold-gradient px-3 py-1.5 text-[11px] font-semibold text-black"
                >
                  <Navigation size={12} /> Traçar rota
                </a>
              )}
            </article>
          ))}

          {!isLoading && partners.length === 0 && (
            <div className="glass-card rounded-xl p-4 text-center text-xs text-muted-foreground">
              Nenhum parceiro nesta categoria por enquanto.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
