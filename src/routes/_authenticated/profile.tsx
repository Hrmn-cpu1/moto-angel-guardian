import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Bike,
  ChevronRight,
  Contact as ContactIcon,
  FileText,
  Gauge,
  History,
  Info as InfoIcon,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  Share2,
  Shield,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { setIntroHidden } from "@/lib/intro";
import { definirPreferenciaTelaBloqueada, preferenciaTelaBloqueada } from "@/lib/lock-navigation";
import type { User } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — Moto Anjo" },
      { name: "description", content: "Gerencie seus dados, moto e preferências." },
      { property: "og:title", content: "Perfil — Moto Anjo" },
      { property: "og:description", content: "Gerencie seus dados." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<User | null>(null);
  const { isAdmin } = useIsAdmin(user?.id);
  /* Navegação na tela bloqueada (P0.1c). Padrão LIGADO e documentado em
     `src/lib/lock-navigation.ts`: o quadro mostra só navegação — nunca nome,
     e-mail, telefone ou contatos. A leitura acontece depois da montagem
     porque esta rota renderiza no servidor. */
  const [navBloqueio, setNavBloqueio] = useState(false);
  useEffect(() => setNavBloqueio(preferenciaTelaBloqueada()), []);

  if (loading || !user) return <LoadingScreen />;

  const startEdit = () => {
    setDraft(user);
    setEditing(true);
  };
  const save = () => {
    if (draft) updateUser(draft);
    setEditing(false);
  };
  const doLogout = () => {
    logout();
    navigate({ to: "/welcome" });
  };

  return (
    <AppShell>
      <Header title="Perfil" subtitle="Sua identidade" showBell />

      <div className="space-y-4 px-5 pt-4">
        <div>
          <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Atalhos
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Shortcut to="/sos" icon={Siren} label="SOS" />
            <Shortcut to="/dashboard" icon={Navigation} label="Iniciar viagem" />
            <Shortcut to="/ride" icon={Gauge} label="Velocímetro" />
            <Shortcut to="/sharing" icon={Share2} label="Compartilhar" />
            <Shortcut to="/alerts" icon={AlertTriangle} label="Alertas próximos" />
            <Shortcut to="/benefits" icon={BadgePercent} label="Benefícios" />
            <Shortcut to="/contacts" icon={ContactIcon} label="Meus contatos" />
            <Shortcut to="/history" icon={History} label="Histórico" />
            <Shortcut to="/map" icon={MapPin} label="Mapa seguro" />
          </div>
        </div>

        <div className="glass-card flex items-center gap-4 rounded-2xl p-5 animate-fade-up">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl gold-gradient text-xl font-black text-black">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
              Motociclista Moto Anjo
            </p>
            <p className="truncate text-lg font-bold text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            onClick={startEdit}
            className="rounded-full border border-gold/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold hover:bg-gold/10"
          >
            Editar
          </button>
        </div>

        {editing && draft ? (
          <div className="glass-card space-y-3 rounded-2xl p-5 animate-fade-up">
            {(
              [
                ["name", "Nome completo"],
                ["email", "E-mail"],
                ["phone", "Telefone"],
                ["bikeModel", "Modelo"],
                ["plate", "Placa"],
                ["bloodType", "Tipo sanguíneo"],
                ["emergencyContact", "Contato de emergência"],
                ["emergencyPhone", "Telefone de emergência"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {label}
                </span>
                <input
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-gold"
                />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <OutlineButton onClick={() => setEditing(false)}>Cancelar</OutlineButton>
              <GoldButton onClick={save}>Salvar</GoldButton>
            </div>
          </div>
        ) : (
          <div className="glass-card grid grid-cols-2 gap-4 rounded-2xl p-5 animate-fade-up">
            <InfoRow label="Telefone" value={user.phone} />
            <InfoRow label="Moto" value={user.bikeModel} />
            <InfoRow label="Placa" value={user.plate} />
            <InfoRow label="Sangue" value={user.bloodType} />
            <InfoRow label="Emergência" value={user.emergencyContact} />
            <InfoRow label="Tel. emergência" value={user.emergencyPhone} />
          </div>
        )}

        <nav className="glass-card divide-y divide-white/5 rounded-2xl">
          <Row icon={UserIcon} label="Dados pessoais" onClick={startEdit} />
          <Row icon={Bike} label="Minha motocicleta" onClick={startEdit} />
          <Row
            icon={ContactIcon}
            label="Contatos de confiança"
            onClick={() => navigate({ to: "/contacts" })}
          />
          <Row
            icon={Lock}
            label="Privacidade"
            onClick={() => toast("Configurações de privacidade em breve.")}
          />
          <button
            onClick={() => {
              const proximo = !navBloqueio;
              setNavBloqueio(proximo);
              definirPreferenciaTelaBloqueada(proximo);
              toast(
                proximo
                  ? "Navegação aparecerá na tela bloqueada durante a viagem."
                  : "Navegação não será mostrada na tela bloqueada.",
              );
            }}
            className="flex w-full items-center gap-3 px-5 py-4 text-left"
          >
            <Smartphone size={16} className="text-gold" />
            <span className="flex-1 text-sm font-medium text-foreground">
              Mostrar navegação na tela bloqueada
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                Só manobra, rota e ETA. Nenhum dado pessoal.
              </span>
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${
                navBloqueio ? "bg-gold/15 text-gold" : "bg-white/5 text-muted-foreground"
              }`}
            >
              {navBloqueio ? "Ligado" : "Desligado"}
            </span>
          </button>
          <Row
            icon={Shield}
            label="Permissões"
            onClick={() => toast("Gerenciar permissões do sistema.")}
          />
          <Row
            icon={FileText}
            label="Termos de Uso"
            onClick={() => navigate({ to: "/terms", search: { accept: false } })}
          />
          <Row
            icon={Sparkles}
            label="Mostrar tela de boas-vindas novamente"
            onClick={() => {
              setIntroHidden(false);
              toast("Tela de boas-vindas reativada.", {
                description: "Ela será exibida no próximo acesso ao aplicativo.",
              });
            }}
          />
          <Row
            icon={ShieldCheck}
            label="Política de Privacidade"
            onClick={() => navigate({ to: "/privacy" })}
          />
          <Row icon={InfoIcon} label="Sobre o Moto Anjo" onClick={() => toast("Moto Anjo v1.0")} />
          {isAdmin && (
            <Row
              icon={ShieldCheck}
              label="Painel Admin"
              onClick={() => navigate({ to: "/admin" })}
            />
          )}
        </nav>

        <OutlineButton
          onClick={doLogout}
          className="!border-emergency/40 !text-emergency hover:!bg-emergency/10"
        >
          <LogOut size={14} /> Sair
        </OutlineButton>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <InfoRowBase label={label} value={value} />;
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

function InfoRowBase({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-gold/5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 bg-gold/5 text-gold">
        <Icon size={16} />
      </span>
      <span className="flex-1 text-sm font-semibold text-foreground">{label}</span>
      <ChevronRight size={16} className="text-muted-foreground" />
    </button>
  );
}
