import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users, UserPlus, MailCheck, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import type { Activity } from "@/components/AdminCharts";

// Recharts (~90kB gzip) only ships when an admin actually opens this screen.
const AdminCharts = lazy(() => import("@/components/AdminCharts"));

export const Route = createFileRoute("/_authenticated/admin")({
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

type ActivityRow = {
  day: string;
  new_users: number | string;
  trips: number | string;
  sos: number | string;
  posts: number | string;
};

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, checking } = useIsAdmin(user?.id);

  const { data } = useQuery({
    queryKey: ["admin", "overview"],
    enabled: isAdmin,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const [statsRes, profilesRes, activityRes] = await Promise.all([
        supabase.rpc("admin_stats"),
        supabase
          .from("profiles")
          .select("id,name,email,created_at")
          .order("created_at", {
            ascending: false,
          })
          .limit(50),
        supabase.rpc("admin_activity", { _days: 30 }),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (activityRes.error) throw activityRes.error;
      const activity: Activity[] = ((activityRes.data ?? []) as ActivityRow[]).map((r) => ({
        day: new Date(r.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        new_users: Number(r.new_users),
        trips: Number(r.trips),
        sos: Number(r.sos),
        posts: Number(r.posts),
      }));
      return {
        stats: (statsRes.data?.[0] ?? null) as Stats | null,
        rows: (profilesRes.data ?? []) as Row[],
        activity,
      };
    },
  });

  if (checking) return <LoadingScreen />;

  if (!isAdmin) {
    return (
      <AppShell>
        <Header title="Admin" subtitle="Acesso restrito" />
        <div className="px-5 pt-5">
          <div className="glass-card rounded-2xl p-4 text-center">
            <ShieldCheck className="mx-auto mb-3 text-gold" size={32} />
            <p className="text-sm text-foreground">
              Você não tem permissão para acessar esta área.
            </p>
            <Link
              to="/dashboard"
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold"
            >
              <ArrowLeft size={14} /> Voltar
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const stats = data?.stats ?? null;
  const rows = data?.rows ?? [];
  const activity = data?.activity ?? [];

  return (
    <AppShell>
      <Header title="Admin" subtitle="Visão geral do Moto Anjo" />
      <div className="space-y-4 px-5 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label="Usuários cadastrados" value={stats?.total_users ?? 0} />
          <StatCard
            icon={MailCheck}
            label="E-mails confirmados"
            value={stats?.confirmed_users ?? 0}
          />
          <StatCard icon={UserPlus} label="Novos (7 dias)" value={stats?.new_last_7d ?? 0} />
          <StatCard icon={UserPlus} label="Novos (30 dias)" value={stats?.new_last_30d ?? 0} />
        </div>

        <Suspense
          fallback={
            <div className="glass-card h-[220px] animate-pulse rounded-2xl" aria-hidden="true" />
          }
        >
          <AdminCharts activity={activity} />
        </Suspense>

        <div className="glass-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
              Últimos cadastros
            </p>
            <span className="text-[10px] text-muted-foreground">{rows.length} exibidos</span>
          </div>
          <div className="divide-y divide-white/5">
            {rows.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum usuário ainda.
              </p>
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
      <p className="mt-3 ma-title font-black text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
