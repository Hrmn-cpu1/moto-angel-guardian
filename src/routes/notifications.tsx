import { createFileRoute } from "@tanstack/react-router";
import { Bell, MapPin, Route as RouteIcon, Share2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SOSFab } from "@/components/SOSFab";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/notifications")({
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

type Note = { id: string; icon: LucideIcon; title: string; body: string; time: string; tone: "gold" | "danger" | "success" };

const NOTES: Note[] = [
  {
    id: "1",
    icon: Share2,
    title: "Contato começou a acompanhar sua viagem",
    body: "Ana Souza está acompanhando o seu trajeto.",
    time: "há 5 min",
    tone: "gold",
  },
  {
    id: "2",
    icon: RouteIcon,
    title: "Alerta de trecho perigoso",
    body: "Curva acentuada com pista molhada em 2 km à frente.",
    time: "há 22 min",
    tone: "danger",
  },
  {
    id: "3",
    icon: ShieldCheck,
    title: "Viagem encerrada com segurança",
    body: "Sua viagem de 34 km foi concluída sem incidentes.",
    time: "ontem",
    tone: "success",
  },
  {
    id: "4",
    icon: MapPin,
    title: "Localização compartilhada",
    body: "Você compartilhou sua localização com Carlos Lima.",
    time: "há 2 dias",
    tone: "gold",
  },
];

function toneClass(t: Note["tone"]) {
  if (t === "danger") return "border-emergency/40 text-emergency bg-emergency/10";
  if (t === "success") return "border-success/40 text-success bg-success/10";
  return "border-gold/30 text-gold bg-gold/10";
}

function Notifications() {
  return (
    <AppShell>
      <Header back="/dashboard" title="Notificações" subtitle="Atualizações" />

      <div className="space-y-3 px-5 pt-4">
        {NOTES.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
            <Bell className="text-gold" size={28} />
            <p className="text-sm text-muted-foreground">Nenhuma notificação agora.</p>
          </div>
        ) : (
          NOTES.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.id} className="glass-card flex items-start gap-3 rounded-2xl p-4 animate-fade-up">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClass(n.tone)}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{n.time}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <SOSFab />
    </AppShell>
  );
}