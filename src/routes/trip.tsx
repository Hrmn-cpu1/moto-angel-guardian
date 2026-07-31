import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Battery, Gauge, MapPin, Pause, Play, Square, User as UserIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { SOSFab } from "@/components/SOSFab";
import { StatusBadge } from "@/components/StatusBadge";
import { useContacts } from "@/hooks/useContacts";
import { useHistory } from "@/hooks/useHistory";

export const Route = createFileRoute("/trip")({
  head: () => ({
    meta: [
      { title: "Iniciar viagem — Moto Anjo" },
      { name: "description", content: "Prepare sua viagem com segurança." },
      { property: "og:title", content: "Iniciar viagem — Moto Anjo" },
      { property: "og:description", content: "Prepare sua viagem com segurança." },
    ],
  }),
  component: TripPage,
});

type Phase = "prepare" | "running" | "summary";

function TripPage() {
  const { contacts } = useContacts();
  const { add } = useHistory();
  const [phase, setPhase] = useState<Phase>("prepare");
  const [companion, setCompanion] = useState<string>(contacts[0]?.name ?? "");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "running" || paused) return;
    timerRef.current = window.setInterval(() => {
      setElapsed((e) => e + 1);
      setDistance((d) => d + Math.random() * 0.02);
      setSpeed(Math.round(45 + Math.random() * 30));
    }, 1000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [phase, paused]);

  useEffect(() => {
    if (!companion && contacts[0]) setCompanion(contacts[0].name);
  }, [contacts, companion]);

  const finish = () => {
    add({
      type: "trip",
      title: `Viagem concluída`,
      description: `${distance.toFixed(1)} km em ${formatDuration(elapsed)}`,
      meta: { distance: Number(distance.toFixed(1)), duration: elapsed },
    });
    setPhase("summary");
  };

  const reset = () => {
    setPhase("prepare");
    setElapsed(0);
    setDistance(0);
    setSpeed(0);
    setPaused(false);
  };

  return (
    <AppShell>
      <Header back="/dashboard" title="Viagem" subtitle="Segurança em movimento" />

      <div className="space-y-4 px-5 pt-4">
        {phase === "prepare" && (
          <div className="space-y-4 animate-fade-up">
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-lg font-bold text-foreground">Preparação</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Antes de sair, confirme os itens de segurança.
              </p>
              <div className="mt-4 space-y-2">
                <Check label="GPS ativo" ok />
                <Check label="Bateria: 87%" ok icon={<Battery size={14} />} />
                <Check label="Escudo Moto Anjo" ok />
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Contato de acompanhamento
              </label>
              <div className="mt-2 space-y-2">
                {contacts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Cadastre um contato primeiro.</p>
                )}
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCompanion(c.name)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                      companion === c.name
                        ? "border-gold bg-gold/10"
                        : "border-white/5 bg-black/30 hover:border-gold/30"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10 text-gold">
                        <UserIcon size={14} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">
                          {c.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {c.relation}
                        </span>
                      </span>
                    </span>
                    {c.isPrimary && (
                      <span className="text-[10px] uppercase tracking-widest text-gold">
                        Principal
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <GoldButton size="lg" onClick={() => setPhase("running")}>
              <Play size={16} /> Iniciar viagem
            </GoldButton>
          </div>
        )}

        {phase === "running" && (
          <div className="space-y-4 animate-fade-up">
            <div className="glass-card rounded-3xl p-6 text-center">
              <StatusBadge
                status={paused ? "warning" : "active"}
                label={paused ? "Em pausa" : "Em viagem"}
              />
              <p className="mt-4 font-mono text-5xl font-black tabular-nums text-foreground">
                {formatDuration(elapsed)}
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                Tempo em movimento
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric
                  icon={<MapPin size={14} />}
                  label="Distância"
                  value={`${distance.toFixed(1)} km`}
                />
                <Metric icon={<Gauge size={14} />} label="Velocidade" value={`${speed} km/h`} />
              </div>
            </div>
            <p className="rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-center text-xs text-muted-foreground">
              Acompanhado por <span className="text-gold">{companion || "—"}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OutlineButton onClick={() => setPaused((p) => !p)}>
                {paused ? <Play size={14} /> : <Pause size={14} />}
                {paused ? "Retomar" : "Pausar"}
              </OutlineButton>
              <OutlineButton onClick={finish}>
                <Square size={14} /> Encerrar
              </OutlineButton>
            </div>
          </div>
        )}

        {phase === "summary" && (
          <div className="space-y-4 animate-scale-in">
            <div className="glass-card rounded-3xl p-6 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
                Viagem concluída
              </p>
              <h2 className="mt-2 text-3xl font-black text-foreground">Chegada segura</h2>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <Metric label="Tempo" value={formatDuration(elapsed)} />
                <Metric label="Distância" value={`${distance.toFixed(1)} km`} />
                <Metric label="Média" value={`${speed} km/h`} />
              </div>
            </div>
            <GoldButton onClick={reset}>Nova viagem</GoldButton>
          </div>
        )}
      </div>
      <SOSFab />
    </AppShell>
  );
}

function Check({ label, ok, icon }: { label: string; ok?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        {icon}
        {label}
      </span>
      <span
        className={`text-[10px] font-semibold uppercase tracking-widest ${ok ? "text-success" : "text-emergency"}`}
      >
        {ok ? "OK" : "Verificar"}
      </span>
    </div>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-3 text-center">
      {icon && <div className="mb-1 flex items-center justify-center text-gold">{icon}</div>}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
