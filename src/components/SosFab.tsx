import { useCallback, useEffect, useRef, useState } from "react";
import { Siren, X, MessageCircle, Send, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useContacts } from "@/hooks/useContacts";
import { historyKey } from "@/hooks/useHistory";
import { useAlerts } from "@/hooks/useAlerts";
import { waLink } from "@/lib/phone";
import { triggerSos } from "@/lib/sos.functions";
import { cn } from "@/lib/utils";

interface Props {
  position: { lat: number; lng: number; accuracy?: number | null } | null;
  className?: string;
}

const HOLD_MS = 3000;

/**
 * Large floating emergency trigger docked above the bottom navigation.
 * Hold for 3s: records the SOS, publishes an emergency incident for nearby
 * riders, opens WhatsApp for the emergency contacts and offers native sharing.
 */
export function SosFab({ position, className }: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const { contacts } = useContacts();
  const { create: createAlert } = useAlerts(
    position ? { lat: position.lat, lng: position.lng } : null,
  );
  const qc = useQueryClient();

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const mapsUrl = position ? `https://www.google.com/maps?q=${position.lat},${position.lng}` : "";
  const message = `🚨 MOTO ANJO — Acionei um SOS. Preciso de ajuda.${
    mapsUrl ? `\n📍 ${mapsUrl}` : ""
  }`;

  const fire = useCallback(async () => {
    if (!position) {
      toast.error("Sem GPS ainda. Aguarde a localização para acionar o SOS.");
      return;
    }
    setOpen(true);
    setSending(true);
    setDone(false);
    try {
      await triggerSos({ data: { lat: position.lat, lng: position.lng, note: null } });
      void qc.invalidateQueries({ queryKey: historyKey });
      // Warn nearby riders through the community incident feed.
      createAlert.mutate({
        type: "perigo",
        title: "SOS acionado por um motociclista",
        description: "Emergência acionada pelo app Moto Anjo.",
        lat: position.lat,
        lng: position.lng,
      });
      const withPhone = contacts.filter((c) => c.phone && c.phone.trim().length > 0);
      if (withPhone.length === 0) {
        toast.info("SOS registrado — nenhum contato cadastrado. Use o compartilhamento.");
      } else {
        toast.success("SOS registrado. Envie o alerta pelo WhatsApp.");
        if (withPhone.length === 1) {
          window.open(waLink(withPhone[0].phone, message), "_blank", "noopener,noreferrer");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar. Use o WhatsApp abaixo.");
    } finally {
      setSending(false);
      setDone(true);
    }
  }, [position, qc, contacts, message, createAlert]);

  const start = useCallback(() => {
    setHolding(true);
    startRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stop();
        void fire();
      }
    }, 50);
  }, [fire, stop]);

  const shareNative = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Moto Anjo — SOS", text: message, url: mapsUrl });
        return;
      }
      await navigator.clipboard.writeText(message);
      toast.success("Alerta copiado para a área de transferência.");
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        aria-label="Acionar SOS de emergência — segure 3 segundos"
        className={cn(
          "fixed bottom-[calc(env(safe-area-inset-bottom)+66px)] left-1/2 z-50 flex h-[86px] w-[86px] -translate-x-1/2 select-none flex-col items-center justify-center rounded-full",
          "border-2 border-emergency/60 text-white transition-transform active:scale-95 animate-pulse-emergency",
          className,
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 35%, oklch(0.70 0.22 27.5), oklch(0.40 0.19 27.5))",
        }}
      >
        <span
          className="absolute inset-[4px] rounded-full"
          style={{
            background: `conic-gradient(rgba(255,255,255,0.9) ${progress * 360}deg, transparent 0)`,
            WebkitMask: "radial-gradient(circle, transparent 70%, black 71%)",
            mask: "radial-gradient(circle, transparent 70%, black 71%)",
          }}
        />
        <span className="relative z-10 flex flex-col items-center leading-none">
          <Siren size={24} />
          <span className="mt-1 text-[13px] font-black uppercase tracking-wider">SOS</span>
          <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.2em] opacity-85">
            {holding ? "Segure" : "Segurar 3s"}
          </span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/80 p-3 animate-fade-up">
          <div className="mx-auto w-full max-w-md rounded-2xl glass-card border-emergency/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emergency">
                  Emergência acionada
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {sending ? "Registrando alerta..." : "Envie pelo WhatsApp"}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar painel de emergência"
                className="rounded-full border border-white/15 p-1.5 text-muted-foreground"
              >
                <X size={14} />
              </button>
            </div>

            {position && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin size={12} className="text-gold" />
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                {position.accuracy ? ` · ±${Math.round(position.accuracy)} m` : ""}
              </p>
            )}

            {sending && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-gold" /> Notificando contatos...
              </p>
            )}

            {done && (
              <div className="mt-3 space-y-2">
                {contacts.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum contato cadastrado. Use o compartilhamento abaixo.
                  </p>
                ) : (
                  contacts.slice(0, 4).map((c) => (
                    <a
                      key={c.id}
                      href={waLink(c.phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-gold/25 bg-black/50 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                        {c.name}
                      </span>
                      <span className="ml-2 flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gold">
                        <MessageCircle size={12} /> WhatsApp
                      </span>
                    </a>
                  ))
                )}
              </div>
            )}

            {!sending && (
              <button
                onClick={shareNative}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl gold-gradient px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-black"
              >
                <Send size={13} /> Compartilhar localização
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
