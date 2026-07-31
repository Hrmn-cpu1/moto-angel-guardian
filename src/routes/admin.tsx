import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Users, UserPlus, MailCheck, ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Moto Anjo" },
      { name: "description", content: "Painel administrativo do Moto Anjo." },
    ],
  }),
  component: AdminPage,
});

type Stats = {
  total_users: number;
  new_last_7d: number;
  new_last_30d: number;
  confirmed_users: number;
};

type Row = { id: string; name: string; email: string; created_at: string };
type Activity = {
  day: string;
  new_users: number;
  trips: number;
  sos: number;
  posts: number;
};

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { next: undefined } });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");
      const admin = !!roles && roles.length > 0;
      setIsAdmin(admin);
      setChecking(false);
      if (!admin) return;

      const { data: s, error: se } = await supabase.rpc("admin_stats");
      if (se) toast.error("Falha ao carregar estatísticas");
      else if (s && s[0]) setStats(s[0] as Stats);

      const { data: p } = await supabase
        .from("profiles")
        .select("id,name,email,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (p) setRows(p as Row[]);

      const { data: a, error: ae } = await supabase.rpc("admin_activity", { _days: 30 });
      if (ae) toast.error("Falha ao carregar atividade");
      else if (a)
        setActivity(
          (a as ActivityRow[]).map((r) => ({
            day: new Date(r.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            new_users: Number(r.new_users),
            trips: Number(r.trips),
            sos: Number(r.sos),
            posts: Number(r.posts),
          })),
        );
    })();
  }, [user]);

  if (loading || checking || !user) return <LoadingScreen />;

  if (!isAdmin) {
    return (
      <AppShell>
        <Header title="Admin" subtitle="Acesso restrito" />
        <div className="px-5 pt-8">
          <div className="glass-card rounded-2xl p-6 text-center">
            <ShieldCheck className="mx-auto mb-3 text-gold" size={32} />
            <p className="text-sm text-foreground">Você não tem permissão para acessar esta área.</p>
            <Link to="/dashboard" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold">
              <ArrowLeft size={14} /> Voltar
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header title="Admin" subtitle="Visão geral do Moto Anjo" />
      <div className="space-y-4 px-5 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label="Usuários cadastrados" value={stats?.total_users ?? 0} />
          <StatCard icon={MailCheck} label="E-mails confirmados" value={stats?.confirmed_users ?? 0} />
          <StatCard icon={UserPlus} label="Novos (7 dias)" value={stats?.new_last_7d ?? 0} />
          <StatCard icon={UserPlus} label="Novos (30 dias)" value={stats?.new_last_30d ?? 0} />
        </div>

        <ChartCard title="Novos cadastros — últimos 30 dias">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8C8C8C", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#8C8C8C", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#F3D675" }} />
              <Area type="monotone" dataKey="new_users" stroke="#D4AF37" strokeWidth={2} fill="url(#gGold)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Atividade — viagens, SOS e posts">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8C8C8C", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#8C8C8C", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#F3D675" }} cursor={{ fill: "rgba(212,175,55,0.06)" }} />
              <Bar dataKey="trips" name="Viagens" stackId="a" fill="#D4AF37" radius={[0, 0, 0, 0]} />
              <Bar dataKey="posts" name="Posts" stackId="a" fill="#F3D675" />
              <Bar dataKey="sos" name="SOS" stackId="a" fill="#D92323" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <LegendDot color="#D4AF37" label="Viagens" />
            <LegendDot color="#F3D675" label="Posts" />
            <LegendDot color="#D92323" label="SOS" />
          </div>
        </ChartCard>

        <div className="glass-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
              Últimos cadastros
            </p>
            <span className="text-[10px] text-muted-foreground">{rows.length} exibidos</span>
          </div>
          <div className="divide-y divide-white/5">
            {rows.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum usuário ainda.</p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.name || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="pb-6 text-center text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Planos pagos — em breve
        </p>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/25 bg-gold/5 text-gold">
          <Icon size={16} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

const tooltipStyle = {
  background: "rgba(17,17,17,0.95)",
  border: "1px solid rgba(212,175,55,0.25)",
  borderRadius: 12,
  fontSize: 11,
  color: "#F5F5F5",
} as const;

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">{title}</p>
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}