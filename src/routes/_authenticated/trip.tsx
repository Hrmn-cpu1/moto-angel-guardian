import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Battery, Gauge, MapPin, Pause, Play, Square, User as UserIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { StatusBadge } from "@/components/StatusBadge";
import { useContacts } from "@/hooks/useContacts";
import { useHistory } from "@/hooks/useHistory";
import { useRideTelemetry } from "@/hooks/useRideTelemetry";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trip")({
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
  const timerRef = useRef<number | null>(null);
  const running = phase === "running" && !paused;
  // Real GPS telemetry — no simulated values are ever recorded.
  const telemetry = useRideTelemetry(running);
  const { distance, speed, average } = telemetry;
  const { error: gpsError, position, startWatch, stopWatch } = useGeolocation();
  const battery = useBatteryLevel();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!running) return;
    timerRef.current = window.setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [running]);

  // Keep a GPS fix alive during preparation so "GPS ativo" reflects reality.
  useEffect(() => {
    startWatch();
    return () => stopWatch();
  }, [startWatch, stopWatch]);

  useEffect(() => {
    if (!companion && contacts[0]) setCompanion(contacts[0].name);
  }, [contacts, companion]);

  const finish = async () => {
    setSaving(true);
    try {
      await add({
        type: "trip",
        title: `Viagem concluída`,
        description: `${distance.toFixed(1)} km em ${formatDuration(elapsed)}`,
        meta: {
          distance: Number(distance.toFixed(1)),
          duration: elapsed,
          companion: companion || "",
        },
      });
    } catch {
      toast.error("Não foi possível salvar a viagem. Verifique sua conexão.");
    } finally {
      setSaving(false);
      setPhase("summary");
    }
  };

  const reset = () => {
    setPhase("prepare");
    setElapsed(0);
    setPaused(false);
    telemetry.reset();
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
                <Check
                  label={position ? "GPS ativo" : gpsError ? "GPS indisponível" : "Obtendo GPS..."}
                  ok={Boolean(position && !position.simulated)}
                />
                {battery !== null && (
                  <Check
                    label={`Bateria: ${battery}%`}
                    ok={battery >= 20}
                    icon={<Battery size={14} />}
                  />
                )}
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
                <Square size={14} /> {saving ? "Salvando..." : "Encerrar"}
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
                <Metric label="Média" value={`${average} km/h`} />
              </div>
            </div>
            <GoldButton onClick={reset}>Nova viagem</GoldButton>
          </div>
        )}
      </div>
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

type BatteryManager = { level: number; addEventListener: (t: string, l: () => void) => void; removeEventListener: (t: string, l: () => void) => void };

/** Real battery level when the browser exposes it; null when unsupported. */
function useBatteryLevel(): number | null {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    let battery: BatteryManager | null = null;
    let onChange: (() => void) | null = null;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (typeof nav.getBattery !== "function") return;
    void nav
      .getBattery()
      .then((b) => {
        battery = b;
        onChange = () => setLevel(Math.round(b.level * 100));
        onChange();
        b.addEventListener("levelchange", onChange);
      })
      .catch(() => setLevel(null));
    return () => {
      if (battery && onChange) battery.removeEventListener("levelchange", onChange);
    };
  }, []);
  return level;
}
