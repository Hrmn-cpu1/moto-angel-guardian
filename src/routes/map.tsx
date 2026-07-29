import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crosshair, Share2, Navigation, MapPin, Fuel, Wrench, Cross, Shield } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { SOSFab } from "@/components/SOSFab";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHistory } from "@/hooks/useHistory";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Mapa — Moto Anjo" },
      { name: "description", content: "Sua posição, pontos de apoio e rotas seguras." },
      { property: "og:title", content: "Mapa — Moto Anjo" },
      { property: "og:description", content: "Sua posição, pontos de apoio e rotas seguras." },
    ],
  }),
  component: MapPage,
});

type POI = { id: string; label: string; type: "hospital" | "fuel" | "shop" | "anjo"; x: number; y: number };
const POIS: POI[] = [
  { id: "1", label: "Hospital Central", type: "hospital", x: 30, y: 32 },
  { id: "2", label: "Posto Ipiranga", type: "fuel", x: 65, y: 48 },
  { id: "3", label: "Oficina do Zé", type: "shop", x: 22, y: 70 },
  { id: "4", label: "Ponto Moto Anjo", type: "anjo", x: 75, y: 22 },
  { id: "5", label: "Posto Shell", type: "fuel", x: 48, y: 78 },
];

const iconFor = {
  hospital: Cross,
  fuel: Fuel,
  shop: Wrench,
  anjo: Shield,
};

function MapPage() {
  const { position, capture, share } = useGeolocation();
  const { add } = useHistory();
  const [selected, setSelected] = useState<POI | null>(null);

  useEffect(() => {
    capture();
  }, [capture]);

  const doShare = async () => {
    if (!position) return;
    const url = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
    const ok = await share("Minha localização — Moto Anjo", url);
    add({
      type: "share",
      title: "Localização compartilhada",
      description: ok ? url : "Copiado para área de transferência",
    });
  };

  return (
    <AppShell>
      <Header title="Mapa" subtitle="Onde você está" showBell />

      <div className="px-5 pt-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl glass-card">
          {/* Stylized map background */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, oklch(0.14 0 0), oklch(0.06 0 0))",
            }}
          />
          <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="oklch(0.78 0.13 84 / 0.25)" strokeWidth="0.15" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
            <path d="M 10 80 Q 40 60 55 45 T 90 20" stroke="oklch(0.78 0.13 84 / 0.5)" strokeWidth="0.6" fill="none" />
            <path d="M 5 40 Q 30 55 60 55 T 95 65" stroke="oklch(0.78 0.13 84 / 0.3)" strokeWidth="0.4" fill="none" />
          </svg>

          {/* You */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-16 w-16 animate-ping rounded-full bg-gold/30" />
              <div className="relative h-4 w-4 rounded-full gold-gradient shadow-[0_0_20px_oklch(0.78_0.13_84/0.8)]" />
            </div>
          </div>

          {POIS.map((p) => {
            const Icon = iconFor[p.type];
            const active = selected?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-label={p.label}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    active
                      ? "gold-gradient border-white/40 text-black scale-110"
                      : p.type === "hospital"
                        ? "border-emergency/50 bg-emergency/20 text-emergency"
                        : "border-gold/40 bg-black/70 text-gold"
                  }`}
                >
                  <Icon size={14} />
                </div>
              </button>
            );
          })}

          {selected && (
            <div className="absolute inset-x-3 bottom-3 rounded-xl glass-card p-3 animate-fade-up">
              <p className="text-[10px] uppercase tracking-widest text-gold">
                {selected.type === "hospital"
                  ? "Hospital"
                  : selected.type === "fuel"
                    ? "Combustível"
                    : selected.type === "shop"
                      ? "Oficina"
                      : "Ponto Moto Anjo"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{selected.label}</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/40 px-4 py-3">
            <MapPin size={14} className="text-gold" />
            <span className="font-mono text-xs text-muted-foreground">
              {position
                ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${position.simulated ? " (simulado)" : ""}`
                : "Localizando..."}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <OutlineButton onClick={() => capture()} size="sm">
              <Crosshair size={14} /> Centralizar
            </OutlineButton>
            <OutlineButton onClick={doShare} size="sm">
              <Share2 size={14} /> Compartilhar
            </OutlineButton>
          </div>
          <GoldButton size="md" onClick={() => alert("Rota planejada. Boa viagem!")}>
            <Navigation size={14} /> Iniciar rota
          </GoldButton>
        </div>
      </div>

      <SOSFab />
    </AppShell>
  );
}