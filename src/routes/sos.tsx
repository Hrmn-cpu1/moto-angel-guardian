import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Share2, X, MapPin } from "lucide-react";
import { Header } from "@/components/Header";
import { EmergencyButton } from "@/components/EmergencyButton";
import { OutlineButton } from "@/components/OutlineButton";
import { GoldButton } from "@/components/GoldButton";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { useHistory } from "@/hooks/useHistory";

export const Route = createFileRoute("/sos")({
  head: () => ({
    meta: [
      { title: "SOS — Moto Anjo" },
      { name: "description", content: "Acionamento de emergência (demonstração)." },
      { property: "og:title", content: "SOS — Moto Anjo" },
      { property: "og:description", content: "Acionamento de emergência (demonstração)." },
    ],
  }),
  component: SOS,
});

function SOS() {
  const navigate = useNavigate();
  const { capture, share } = useGeolocation();
  const { add } = useHistory();
  const [pos, setPos] = useState<GeoPosition | null>(null);
  const [activated, setActivated] = useState(false);

  const activate = async () => {
    const p = await capture();
    setPos(p);
    setActivated(true);
    add({
      type: "sos",
      title: "Alerta SOS ativado (demo)",
      description: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    });
  };

  const shareAlert = async () => {
    if (!pos) return;
    const url = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const ok = await share(
      `[DEMO] Alerta Moto Anjo — preciso de ajuda em ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
      url,
    );
    add({
      type: "share",
      title: "Alerta compartilhado",
      description: ok ? "Compartilhado com sucesso" : "Copiado / falha no envio",
    });
  };

  const cancel = () => {
    setActivated(false);
    setPos(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-black">
      <Header back="/dashboard" title="SOS" subtitle="Emergência" />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        {!activated ? (
          <>
            <div className="text-center">
              <h2 className="text-3xl font-black tracking-tight text-emergency">EMERGÊNCIA</h2>
              <p className="mt-2 text-sm text-muted-foreground">Modo de demonstração</p>
            </div>
            <EmergencyButton onActivate={activate} />
          </>
        ) : (
          <div className="w-full space-y-6 animate-scale-in">
            <div className="glass-card rounded-3xl border-emergency/40 p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emergency/20 text-emergency">
                <MapPin size={28} />
              </div>
              <h2 className="mt-4 text-xl font-black text-foreground">
                Alerta de demonstração ativado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhum serviço de emergência real foi contatado.
              </p>
              {pos && (
                <div className="mt-4 rounded-xl border border-white/5 bg-black/40 p-3 font-mono text-xs text-gold">
                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                  {pos.simulated && (
                    <span className="ml-2 text-[10px] text-muted-foreground">(simulado)</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <GoldButton onClick={shareAlert} size="lg">
                <Share2 size={16} /> Compartilhar alerta
              </GoldButton>
              <OutlineButton onClick={cancel} size="lg">
                <X size={16} /> Cancelar alerta
              </OutlineButton>
            </div>
          </div>
        )}
      </div>
      <p className="px-6 pb-8 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Esta é uma demonstração. Em uma emergência real, ligue 190 / 193 / 192.
      </p>
      <button
        onClick={() => navigate({ to: "/dashboard" })}
        className="hidden"
        aria-hidden
      />
    </div>
  );
}