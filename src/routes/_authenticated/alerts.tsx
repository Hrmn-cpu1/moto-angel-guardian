import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Bike, MapPin, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { ALERT_LABEL, ehSos, useAlerts, type AlertType } from "@/hooks/useAlerts";
import { abrirNavegacaoExterna } from "@/lib/external-navigation";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Alertas Próximos — Moto Anjo" },
      {
        name: "description",
        content: "Perigos, acidentes e bloqueios reportados por motociclistas perto de você.",
      },
      { property: "og:title", content: "Alertas Próximos — Moto Anjo" },
      {
        property: "og:description",
        content: "Perigos, acidentes e bloqueios reportados por motociclistas perto de você.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

const TYPES: { key: AlertType; icon: typeof AlertTriangle }[] = [
  { key: "perigo", icon: AlertTriangle },
  { key: "acidente", icon: ShieldAlert },
  { key: "bloqueio", icon: Ban },
  { key: "roubo", icon: Bike },
];

function AlertsPage() {
  const { position, capture } = useGeolocation();
  const { alerts, loading, create, remove, refresh } = useAlerts(position);
  const [filter, setFilter] = useState<AlertType | "todos">("todos");
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<AlertType>("perigo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    void capture();
  }, [capture]);

  const visible = useMemo(
    () => (filter === "todos" ? alerts : alerts.filter((a) => a.type === filter)),
    [alerts, filter],
  );

  const submit = async () => {
    if (!position) {
      toast.error("Localização indisponível para publicar o alerta.");
      return;
    }
    if (title.trim().length < 3) {
      toast.error("Descreva o alerta com pelo menos 3 caracteres.");
      return;
    }
    try {
      await create.mutateAsync({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        lat: position.lat,
        lng: position.lng,
      });
      toast.success("Alerta enviado para a comunidade.");
      setTitle("");
      setDescription("");
      setComposing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar alerta.");
    }
  };

  return (
    <AppShell>
      <Header
        title="Alertas Próximos"
        subtitle="Comunidade em tempo real"
        showBell
        right={
          <button
            onClick={refresh}
            aria-label="Atualizar alertas"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-gold transition hover:bg-gold/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <div className="space-y-4 px-5 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={filter === "todos"} onClick={() => setFilter("todos")}>
            Todos
          </Chip>
          {TYPES.map(({ key, icon: Icon }) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
              <Icon size={12} /> {ALERT_LABEL[key]}
            </Chip>
          ))}
        </div>

        {composing ? (
          <div className="glass-card space-y-3 rounded-xl p-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                Enviar alerta
              </p>
              <button
                onClick={() => setComposing(false)}
                className="text-muted-foreground transition hover:text-gold"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[9px] font-semibold uppercase tracking-wider transition ${
                    type === key
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-gold/15 text-muted-foreground"
                  }`}
                >
                  <Icon size={16} />
                  {ALERT_LABEL[key]}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Buraco profundo na pista"
              maxLength={90}
              className="w-full rounded-lg border border-gold/20 bg-black/50 px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes (opcional)"
              rows={2}
              maxLength={280}
              className="w-full resize-none rounded-lg border border-gold/20 bg-black/50 px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold"
            />
            <GoldButton onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Enviando..." : "Enviar alerta"}
            </GoldButton>
          </div>
        ) : (
          <OutlineButton onClick={() => setComposing(true)}>
            <Plus size={15} /> Enviar alerta
          </OutlineButton>
        )}

        {loading && (
          <p className="py-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Buscando alertas...
          </p>
        )}

        {!loading && visible.length === 0 && (
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-sm font-semibold text-foreground">Nenhum alerta por perto</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Boa viagem. Você será avisado se algo for reportado num raio de 25 km.
            </p>
          </div>
        )}

        <div className="space-y-3 pb-4">
          {visible.map((a) => {
            const Icon = ehSos(a.type)
              ? ShieldAlert
              : (TYPES.find((t) => t.key === a.type)?.icon ?? AlertTriangle);
            const critical = ehSos(a.type) || a.type === "acidente" || a.type === "roubo";
            return (
              <article key={a.id} className="glass-card flex gap-3 rounded-xl p-4 animate-fade-up">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                    critical
                      ? "border-emergency/40 bg-emergency/15 text-emergency"
                      : "border-gold/30 bg-gold/10 text-gold"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{a.title}</p>
                    <span className="shrink-0 text-[10px] uppercase tracking-widest text-gold">
                      {a.distance_km < 1
                        ? `${Math.round(a.distance_km * 1000)} m`
                        : `${a.distance_km.toFixed(1)} km`}
                    </span>
                  </div>
                  {a.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>
                      {ALERT_LABEL[a.type] ?? a.type} · {a.author_name} ·{" "}
                      {new Date(a.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          void abrirNavegacaoExterna("google", {
                            latitude: a.lat,
                            longitude: a.lng,
                            label: a.title,
                          })
                        }
                        className="flex items-center gap-1 text-gold"
                      >
                        <MapPin size={11} /> Ver
                      </button>
                      {a.is_mine && (
                        <button
                          onClick={() => remove.mutate(a.id)}
                          className="text-emergency"
                          aria-label="Remover alerta"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition ${
        active ? "border-gold bg-gold/10 text-gold" : "border-gold/15 text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
