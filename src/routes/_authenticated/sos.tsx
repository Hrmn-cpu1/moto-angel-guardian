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
import { useHistory } from "@/hooks/useHistory";
import { supabase } from "@/integrations/supabase/client";
import { triggerSos, dispatchSosNotifications } from "@/lib/sos.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sos")({
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
  const [sosEventId, setSosEventId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const dispatchedOnce = useRef(false);

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

  const runDispatch = async (onlyFailed: boolean) => {
    if (!sosEventId) return;
    setDispatching(true);
    try {
      const res = await dispatchSosNotifications({ data: { sosEventId, onlyFailed } });
      if (res.failed > 0) {
        toast.warning(`${res.sent} enviados · ${res.failed} falharam`);
      } else if (res.sent > 0) {
        toast.success("Todos os contatos foram notificados.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar alertas.";
      toast.error(msg);
    } finally {
      setDispatching(false);
    }
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

    try {
      const res = await triggerSos({
        data: { lat: p.lat, lng: p.lng, note: p.simulated ? "Localização simulada" : null },
      });
      setSosEventId(res.sosEventId);
      if (res.queued === 0) {
        toast.info("SOS registrado — nenhum contato de emergência cadastrado.");
        return;
      }
      toast.success(`SOS registrado — enviando ${res.queued} alerta(s)...`);
      if (!dispatchedOnce.current) {
        dispatchedOnce.current = true;
        void runDispatch(false);
      }
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
    add({
      type: "share",
      title: "Alerta compartilhado",
      description: ok ? "Compartilhado com sucesso" : "Copiado / falha no envio",
    });
  };

  const cancel = () => {
    setActivated(false);
    setPos(null);
    setSosEventId(null);
    setNotifications([]);
    dispatchedOnce.current = false;
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
            </div>

            {notifications.length > 0 ? (
              <div className="glass-card space-y-2 rounded-3xl p-4">
                <div className="mb-1 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
                    <MessageCircle size={14} /> Alertas WhatsApp
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {summary.sent}/{summary.total} enviados
                    {summary.failed > 0 && ` · ${summary.failed} falhou`}
                  </div>
                </div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {n.recipient_name || "Contato"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {n.recipient_phone}
                        {n.status === "failed" && n.error_message && (
                          <span className="ml-2 text-emergency">
                            · {shortError(n.error_message)}
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusPill status={n.status} />
                  </div>
                ))}
                {summary.failed > 0 && (
                  <button
                    onClick={() => runDispatch(true)}
                    disabled={dispatching}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-gold transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={dispatching ? "animate-spin" : ""} />
                    Reenviar {summary.failed} alerta{summary.failed > 1 ? "s" : ""}
                  </button>
                )}
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
