import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Shield,
  Navigation,
  Share2,
  Route as RouteIcon,
  Users,
  Contact,
  History,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SOSFab } from "@/components/SOSFab";
import { LocationCard } from "@/components/LocationCard";
import { ShareLocationButton } from "@/components/ShareLocationButton";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Início — Moto Anjo" },
      { name: "description", content: "Painel de proteção e recursos Moto Anjo." },
      { property: "og:title", content: "Início — Moto Anjo" },
      { property: "og:description", content: "Painel de proteção e recursos Moto Anjo." },
    ],
  }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function Dashboard() {
  const { user, loading } = useAuth();
  const { position, capture } = useGeolocation();
  const [sync, setSync] = useState<string>();

  useEffect(() => {
    capture().then(() => setSync(new Date().toLocaleTimeString("pt-BR").slice(0, 5)));
  }, [capture]);

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      <Header
        title={user.name.split(" ")[0]}
        subtitle={`${greeting()}, motociclista.`}
        showBell
        right={
          <div className="flex h-10 w-10 items-center justify-center rounded-full gold-gradient text-sm font-black text-black">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        }
      />

      <div className="space-y-4 px-5 pt-5">
        {/* Escudo card */}
        <div className="relative overflow-hidden rounded-3xl glass-card p-6 animate-fade-up">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
            style={{
              background: "radial-gradient(circle, oklch(0.78 0.13 84 / 0.25), transparent 70%)",
            }}
          />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
                Escudo Moto Anjo
              </p>
              <h2 className="mt-2 text-2xl font-black text-foreground">Proteção ativa</h2>
              <StatusBadge status="active" label="Todos os sistemas OK" className="mt-3" />
              <p className="mt-4 max-w-[220px] text-sm text-muted-foreground">
                Localização e recursos de segurança disponíveis.
              </p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gold-gradient shadow-[0_10px_40px_-10px_oklch(0.78_0.13_84/0.6)]">
              <Shield size={30} className="text-black" strokeWidth={2.4} />
            </div>
          </div>
          <button
            onClick={() => alert("Escudo Moto Anjo ativo. Todos os recursos disponíveis.")}
            className="mt-5 flex w-full items-center justify-between rounded-xl border border-gold/25 bg-black/30 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold transition hover:bg-gold/5"
          >
            Ver status
            <ChevronRight size={16} />
          </button>
        </div>

        <LocationCard position={position} lastSync={sync} />
        <ShareLocationButton />

        <div>
          <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Atalhos
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Shortcut to="/trip" icon={Navigation} label="Iniciar viagem" />
            <Shortcut to="/map" icon={Share2} label="Compartilhar" />
            <Shortcut to="/map" icon={RouteIcon} label="Rotas seguras" />
            <Shortcut to="/community" icon={Users} label="Comunidade" />
            <Shortcut to="/contacts" icon={Contact} label="Meus contatos" />
            <Shortcut to="/history" icon={History} label="Histórico" />
          </div>
        </div>

        <Link
          to="/sos"
          className="mt-2 flex items-center justify-between rounded-2xl border border-emergency/40 bg-emergency/10 px-5 py-4 transition hover:bg-emergency/15"
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emergency">
              Emergência
            </p>
            <p className="text-sm font-semibold text-foreground">Ativar alerta SOS</p>
          </div>
          <ChevronRight size={18} className="text-emergency" />
        </Link>
      </div>

      <SOSFab />
    </AppShell>
  );
}

function Shortcut({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="glass-card group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition hover:border-gold/40"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/25 bg-gold/5 text-gold group-hover:bg-gold/10">
        <Icon size={18} />
      </div>
      <span className="text-[10px] font-semibold leading-tight text-foreground">{label}</span>
    </Link>
  );
}
