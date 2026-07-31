import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, History as HistoryIcon, MapPin, Share2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { EmptyState } from "@/components/EmptyState";
import { useHistory } from "@/hooks/useHistory";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Histórico — Moto Anjo" },
      { name: "description", content: "Suas viagens, alertas e compartilhamentos." },
      { property: "og:title", content: "Histórico — Moto Anjo" },
      { property: "og:description", content: "Suas viagens, alertas e compartilhamentos." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { items, clear } = useHistory();

  return (
    <AppShell>
      <Header
        back="/dashboard"
        title="Histórico"
        subtitle="Sua jornada"
        right={
          items.length > 0 && (
            <button
              onClick={() => confirm("Limpar histórico?") && clear()}
              className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-emergency"
            >
              Limpar
            </button>
          )
        }
      />

      <div className="space-y-3 px-5 pt-4">
        {items.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Sem registros ainda"
            description="Inicie uma viagem, envie um alerta ou compartilhe sua localização para ver aqui."
          />
        ) : (
          items.map((it) => {
            const Icon = it.type === "trip" ? MapPin : it.type === "sos" ? AlertTriangle : Share2;
            const accent =
              it.type === "sos" ? "border-emergency/40 text-emergency" : "border-gold/30 text-gold";
            return (
              <div
                key={it.id}
                className="glass-card flex items-start gap-3 rounded-2xl p-4 animate-fade-up"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-black/40 ${accent}`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{it.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.description}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(it.timestamp).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
