import { createFileRoute } from "@tanstack/react-router";
import { Gauge, RotateCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { OutlineButton } from "@/components/OutlineButton";
import { Speedometer } from "@/components/Speedometer";
import { LeanGauge } from "@/components/LeanGauge";
import { useRideTelemetry } from "@/hooks/useRideTelemetry";

export const Route = createFileRoute("/_authenticated/ride")({
  head: () => ({
    meta: [
      { title: "Velocímetro e Giroscópio — Moto Anjo" },
      {
        name: "description",
        content: "Velocidade em tempo real e inclinação da moto durante a pilotagem.",
      },
      { property: "og:title", content: "Velocímetro e Giroscópio — Moto Anjo" },
      {
        property: "og:description",
        content: "Velocidade em tempo real e inclinação da moto durante a pilotagem.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RidePage,
});

function RidePage() {
  const t = useRideTelemetry(true);

  return (
    <AppShell>
      <Header back="/dashboard" title="Velocímetro" subtitle="Painel de pilotagem" showBell />

      <div className="space-y-4 px-5 pt-4">
        <div className="glass-card rounded-xl p-5 animate-fade-up">
          <Speedometer speed={t.speed} />
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-gold/15 pt-4 text-center">
            <Stat label="Média" value={`${t.average} km/h`} />
            <Stat label="Máxima" value={`${t.max} km/h`} />
            <Stat label="Distância" value={`${t.distance.toFixed(1)} km`} />
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 animate-fade-up">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
            Giroscópio
          </p>
          <LeanGauge lean={t.lean} pitch={t.pitch} />
          {!t.motionGranted && (
            <div className="mt-4">
              <OutlineButton size="sm" onClick={() => void t.requestMotion()}>
                <Gauge size={14} />
                {t.motionAvailable ? "Ativar sensores de inclinação" : "Sensores indisponíveis"}
              </OutlineButton>
            </div>
          )}
        </div>

        <OutlineButton size="sm" onClick={t.reset}>
          <RotateCw size={14} /> Zerar sessão
        </OutlineButton>

        <p className="pb-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Um por todos e todos por um.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
