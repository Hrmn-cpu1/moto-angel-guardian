import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Share2, X, MapPin, MessageCircle, Send } from "lucide-react";
import { Header } from "@/components/Header";
import { EmergencyButton } from "@/components/EmergencyButton";
import { OutlineButton } from "@/components/OutlineButton";
import { GoldButton } from "@/components/GoldButton";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { useHistory } from "@/hooks/useHistory";
import { useContacts } from "@/hooks/useContacts";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { waLink } from "@/lib/phone";
import type { Contact } from "@/types";

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
  const { contacts } = useContacts();
  const { user } = useAuth();
  const [pos, setPos] = useState<GeoPosition | null>(null);
  const [activated, setActivated] = useState(false);
  const [notified, setNotified] = useState<string[]>([]);

  const buildMessage = (p: GeoPosition) => {
    const name = user?.name || "Um motociclista";
    const url = `https://www.google.com/maps?q=${p.lat},${p.lng}`;
    return `🚨 ALERTA MOTO ANJO 🚨\n\n${name} acionou o SOS e pode precisar de ajuda.\n\n📍 Localização: ${url}\n(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})\n\nEnviado automaticamente pelo app Moto Anjo.`;
  };

  const openWhatsApp = (contact: Contact, p: GeoPosition) => {
    const link = waLink(contact.phone, buildMessage(p));
    window.open(link, "_blank", "noopener,noreferrer");
    setNotified((n) => (n.includes(contact.id) ? n : [...n, contact.id]));
  };

  const activate = async () => {
    const p = await capture();
    setPos(p);
    setActivated(true);
    add({
      type: "sos",
      title: "Alerta SOS ativado",
      description: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    });

    // Persist SOS event in Supabase
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from("sos_events").insert({
          user_id: authUser.id,
          latitude: p.lat,
          longitude: p.lng,
          status: "active",
          note: p.simulated ? "Localização simulada" : null,
        });
      }
    } catch (e) {
      console.error("Failed to persist SOS event", e);
    }

    // Auto-open WhatsApp for the primary contact (or first contact) in the same user gesture
    const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];
    if (primary) {
      openWhatsApp(primary, p);
    }
  };

  const shareAlert = async () => {
    if (!pos) return;
    const url = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const ok = await share(buildMessage(pos), url);
    add({
      type: "share",
      title: "Alerta compartilhado",
      description: ok ? "Compartilhado com sucesso" : "Copiado / falha no envio",
    });
  };

  const cancel = () => {
    setActivated(false);
    setPos(null);
    setNotified([]);
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
                Alerta SOS ativado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Notifique seus contatos de emergência via WhatsApp.
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

            {contacts.length > 0 ? (
              <div className="glass-card space-y-2 rounded-3xl p-4">
                <div className="mb-1 flex items-center gap-2 px-1 text-xs uppercase tracking-widest text-gold">
                  <MessageCircle size={14} /> Contatos de emergência
                </div>
                {contacts.map((c) => {
                  const sent = notified.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => pos && openWhatsApp(c, pos)}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-black/40 px-4 py-3 text-left transition hover:border-gold/40"
                    >
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {c.name}
                          {c.isPrimary && (
                            <span className="ml-2 text-[10px] uppercase tracking-widest text-gold">
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.phone} · {c.relation}</div>
                      </div>
                      <span
                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${
                          sent
                            ? "bg-gold/20 text-gold"
                            : "bg-emergency/20 text-emergency"
                        }`}
                      >
                        <Send size={12} /> {sent ? "Enviado" : "WhatsApp"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card rounded-3xl p-4 text-center text-xs text-muted-foreground">
                Nenhum contato de emergência cadastrado.{" "}
                <button
                  onClick={() => navigate({ to: "/contacts" })}
                  className="font-semibold text-gold underline"
                >
                  Cadastrar agora
                </button>
              </div>
            )}

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