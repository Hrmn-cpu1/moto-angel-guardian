import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Share2,
  X,
  MapPin,
  MessageCircle,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Header } from "@/components/Header";
import { EmergencyButton } from "@/components/EmergencyButton";
import { OutlineButton } from "@/components/OutlineButton";
import { GoldButton } from "@/components/GoldButton";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { historyKey } from "@/hooks/useHistory";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { triggerSos } from "@/lib/sos.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sos")({
  head: () => ({
    meta: [
      { title: "SOS — Moto Anjo" },
      { name: "description", content: "Acionamento de emergência com localização em tempo real." },
      { property: "og:title", content: "SOS — Moto Anjo" },
      { property: "og:description", content: "Acionamento de emergência com localização em tempo real." },
    ],
  }),
  component: SOS,
});

function SOS() {
  const navigate = useNavigate();
  const { capture, share } = useGeolocation();
  const queryClient = useQueryClient();
  const refreshHistory = () => {
    void queryClient.invalidateQueries({ queryKey: historyKey });
  };
  const [pos, setPos] = useState<GeoPosition | null>(null);
  const [activated, setActivated] = useState(false);
  const [sosEventId, setSosEventId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const openedOnce = useRef(false);
  const [gpsFailed, setGpsFailed] = useState(false);

  const whatsappLink = (phone: string) => {
    const digits = (phone || "").replace(/\D/g, "");
    const to = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    const url = pos ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : "";
    const text = `🚨 MOTO ANJO — Acionei um SOS. Preciso de ajuda.${url ? `\n📍 ${url}` : ""}`;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  };

  const summary = useMemo(() => {
    const sent = notifications.filter((n) => n.status === "sent").length;
    const failed = notifications.filter((n) => n.status === "failed").length;
    const pending = notifications.filter((n) => n.status === "queued").length;
    return { sent, failed, pending, total: notifications.length };
  }, [notifications]);

  // Realtime subscription for progress of the current SOS event
  useEffect(() => {
    if (!sosEventId) return;
    const load = async () => {
      const { data } = await supabase
        .from("whatsapp_notifications")
        .select("id, recipient_name, recipient_phone, status, error_message, sent_at")
        .eq("sos_event_id", sosEventId)
        .order("created_at", { ascending: true });
      setNotifications((data ?? []) as Notification[]);
    };
    void load();
    const channel = supabase
      .channel(`wn:${sosEventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_notifications",
          filter: `sos_event_id=eq.${sosEventId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sosEventId]);

  // With a single contact the WhatsApp chat opens automatically once.
  useEffect(() => {
    if (openedOnce.current) return;
    if (!pos || notifications.length !== 1) return;
    openedOnce.current = true;
    window.open(whatsappLink(notifications[0].recipient_phone), "_blank", "noopener,noreferrer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, pos]);

  const activate = async () => {
    const p = await capture();
    if (p.simulated) {
      // Never register or transmit a fabricated position in an emergency.
      setGpsFailed(true);
      setActivated(true);
      setPos(null);
      toast.error("GPS indisponível. Ative a localização e toque em tentar novamente.");
      return;
    }
    setGpsFailed(false);
    setPos(p);
    setActivated(true);

    try {
      const res = await triggerSos({
        data: { lat: p.lat, lng: p.lng, note: null },
      });
      setSosEventId(res.sosEventId);
      // The server function is the single writer of the SOS record; just refresh
      // the local history cache so the event shows up without duplicating rows.
      refreshHistory();
      if (res.queued === 0) {
        toast.info("SOS registrado — nenhum contato de emergência cadastrado.");
        return;
      }
      toast.success(`SOS registrado — envie o alerta pelo WhatsApp (${res.queued} contato(s)).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao registrar SOS.";
      toast.error(msg);
    }
  };

  const shareAlert = async () => {
    if (!pos) return;
    const url = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const msg = `🚨 MOTO ANJO — Preciso de ajuda.\n📍 ${url}`;
    const ok = await share(msg, url);
    toast[ok ? "success" : "error"](
      ok ? "Alerta compartilhado." : "Não foi possível compartilhar o alerta.",
    );
  };

  const cancel = () => {
    setActivated(false);
    setPos(null);
    setSosEventId(null);
    setNotifications([]);
    openedOnce.current = false;
    setGpsFailed(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-black">
      <Header back="/dashboard" title="SOS" subtitle="Emergência" />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        {!activated ? (
          <>
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-tight text-emergency">
                ⚠ Emergência
              </h2>
              <p className="mt-2 text-sm text-foreground">Precisa de ajuda?</p>
              <p className="text-sm text-muted-foreground">Acione o botão abaixo.</p>
            </div>
            <EmergencyButton onActivate={activate} />
          </>
        ) : (
          <div className="w-full space-y-6 animate-scale-in">
            <div className="glass-card rounded-3xl border-emergency/40 p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emergency/20 text-emergency">
                <MapPin size={28} />
              </div>
              <h2 className="mt-4 text-xl font-black text-foreground">Alerta SOS ativado</h2>
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
              {gpsFailed && (
                <div className="mt-4 space-y-3">
                  <p className="rounded-xl border border-emergency/40 bg-emergency/10 p-3 text-xs text-emergency">
                    Não foi possível obter sua localização real. O SOS não será registrado com uma
                    posição incorreta.
                  </p>
                  <GoldButton onClick={activate} size="lg">
                    Tentar novamente
                  </GoldButton>
                </div>
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="glass-card space-y-2 rounded-3xl p-4">
                <div className="mb-1 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
                    <MessageCircle size={14} /> Alertas WhatsApp
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {summary.total} contato{summary.total > 1 ? "s" : ""}
                  </div>
                </div>
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">
                  Toque em cada contato para enviar o alerta pelo seu WhatsApp:
                </p>
                {notifications.map((n) => (
                  <a
                    key={n.id}
                    href={whatsappLink(n.recipient_phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-black/40 px-4 py-3 transition hover:bg-gold/10"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {n.recipient_name || "Contato"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {n.recipient_phone}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-gold">
                      <Send size={13} /> WhatsApp
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="glass-card rounded-3xl p-4 text-center text-xs text-muted-foreground">
                {sosEventId ? (
                  "Nenhum contato de emergência cadastrado para notificar."
                ) : (
                  <>
                    Nenhum contato de emergência cadastrado.{" "}
                    <button
                      onClick={() => navigate({ to: "/contacts" })}
                      className="font-semibold text-gold underline"
                    >
                      Cadastrar agora
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="space-y-3">
              <GoldButton onClick={shareAlert} size="lg" disabled={!pos}>
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
        Em uma emergência com risco de vida, ligue também 190 / 193 / 192.
      </p>
      <button onClick={() => navigate({ to: "/dashboard" })} className="hidden" aria-hidden />
    </div>
  );
}

type Notification = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  status: "queued" | "sent" | "failed" | string;
  error_message: string | null;
  sent_at: string | null;
};

function StatusPill({ status }: { status: string }) {
  if (status === "sent")
    return (
      <span className="flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1 text-[11px] font-semibold text-gold">
        <CheckCircle2 size={12} /> Enviado
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex items-center gap-1 rounded-full bg-emergency/20 px-3 py-1 text-[11px] font-semibold text-emergency">
        <XCircle size={12} /> Falhou
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
      <Loader2 size={12} className="animate-spin" /> Enviando
    </span>
  );
}

function shortError(msg: string): string {
  const m = msg.match(/"message"\s*:\s*"([^"]+)"/);
  const raw = m ? m[1] : msg;
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
}
