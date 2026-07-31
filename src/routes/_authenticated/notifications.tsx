import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, MessageCircle, Route as RouteIcon, ShieldAlert, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useHistory } from "@/hooks/useHistory";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações — Moto Anjo" },
      { name: "description", content: "Suas notificações recentes." },
      { property: "og:title", content: "Notificações — Moto Anjo" },
      { property: "og:description", content: "Suas notificações recentes." },
    ],
  }),
  component: Notifications,
});

type Note = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  ts: string;
  tone: "gold" | "danger" | "success";
};

type WaRow = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

async function fetchWhatsApp(): Promise<WaRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_notifications")
    .select("id, recipient_name, recipient_phone, status, error_message, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as WaRow[];
}

function toneClass(t: Note["tone"]) {
  if (t === "danger") return "border-emergency/40 text-emergency bg-emergency/10";
  if (t === "success") return "border-success/40 text-success bg-success/10";
  return "border-gold/30 text-gold bg-gold/10";
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function Notifications() {
  const { items, loading: historyLoading } = useHistory();
  const { data: waRows, isLoading: waLoading } = useQuery({
    queryKey: ["whatsapp-notifications"],
    queryFn: fetchWhatsApp,
    staleTime: 30_000,
  });

  const notes: Note[] = [
    ...(waRows ?? []).map<Note>((w) => ({
      id: `wa-${w.id}`,
      icon: MessageCircle,
      title:
        w.status === "sent"
          ? `Alerta enviado para ${w.recipient_name || w.recipient_phone}`
          : w.status === "failed"
            ? `Falha ao alertar ${w.recipient_name || w.recipient_phone}`
            : `Alerta em envio para ${w.recipient_name || w.recipient_phone}`,
      body:
        w.status === "failed"
          ? (w.error_message ?? "Não foi possível entregar a mensagem.")
          : w.recipient_phone,
      ts: w.sent_at ?? w.created_at,
      tone: w.status === "sent" ? "success" : w.status === "failed" ? "danger" : "gold",
    })),
    ...items.map<Note>((h) => ({
      id: `h-${h.id}`,
      icon: h.type === "sos" ? ShieldAlert : RouteIcon,
      title: h.title,
      body: h.description,
      ts: h.timestamp,
      tone: h.type === "sos" ? "danger" : "gold",
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const loading = historyLoading || waLoading;

  return (
    <AppShell>
      <Header back="/dashboard" title="Notificações" subtitle="Atualizações" />

      <div className="space-y-3 px-5 pt-4">
        {loading ? (
          <div className="glass-card flex items-center justify-center gap-2 rounded-2xl p-8 text-sm text-muted-foreground">
            <Loader2 className="animate-spin text-gold" size={16} /> Carregando...
          </div>
        ) : notes.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
            <Bell className="text-gold" size={28} />
            <p className="text-sm text-muted-foreground">Nenhuma notificação agora.</p>
            <p className="text-xs text-muted-foreground">
              Suas viagens, acionamentos de SOS e alertas enviados aparecem aqui.
            </p>
          </div>
        ) : (
          notes.map((n) => {
            const Icon = n.icon;
            return (
              <div
                key={n.id}
                className="glass-card flex items-start gap-3 rounded-2xl p-4 animate-fade-up"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClass(n.tone)}`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {relative(n.ts)}
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
