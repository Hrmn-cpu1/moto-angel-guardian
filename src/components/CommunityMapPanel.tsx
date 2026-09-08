import { useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  CircleDot,
  Droplets,
  Loader2,
  Megaphone,
  ShieldAlert,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import type { AlertType, NearbyAlert } from "@/hooks/useAlerts";
import { ALERT_LABEL } from "@/hooks/useAlerts";
import { distanciaCurta } from "@/lib/map-events";
import { camada } from "@/lib/layers";

// Specific road hazards use the existing perigo category and a descriptive
// title, so reports work with the current database and older app versions.
export const ROAD_REPORTS = [
  { id: "buraco", type: "perigo", title: "Buraco na pista", label: "Buraco", icon: CircleDot },
  {
    id: "pista",
    type: "perigo",
    title: "Pista escorregadia",
    label: "Óleo / pista lisa",
    icon: Droplets,
  },
  {
    id: "acidente",
    type: "acidente",
    title: "Acidente na via",
    label: "Acidente",
    icon: ShieldAlert,
  },
  { id: "bloqueio", type: "bloqueio", title: "Via bloqueada", label: "Via bloqueada", icon: Ban },
  {
    id: "objeto",
    type: "perigo",
    title: "Objeto na pista",
    label: "Objeto na pista",
    icon: AlertTriangle,
  },
  { id: "perigo", type: "perigo", title: "Perigo na via", label: "Outro perigo", icon: Megaphone },
] as const satisfies ReadonlyArray<{
  id: string;
  type: AlertType;
  title: string;
  label: string;
  icon: typeof AlertTriangle;
}>;

export type RoadReport = { type: AlertType; title: string };

/** Nearest first; an active SOS keeps its emergency priority. */
export function sortNearbyAlerts(alerts: NearbyAlert[]) {
  return [...alerts].sort(
    (a, b) => Number(b.type === "sos") - Number(a.type === "sos") || a.distance_km - b.distance_km,
  );
}

export function CommunityRadar({
  alerts,
  loading,
  error,
  onOpen,
  liveUpdates = false,
}: {
  alerts: NearbyAlert[];
  loading: boolean;
  error: Error | null;
  onOpen: () => void;
  liveUpdates?: boolean;
}) {
  const first = sortNearbyAlerts(alerts)[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)] ${camada("painelInferior")} flex items-center gap-3 rounded-2xl border border-white/15 bg-map-panel/96 p-4 text-left shadow-map`}
      aria-label="Ver avisos da comunidade"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
        <Megaphone size={23} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gold">
          Comunidade · {liveUpdates ? "ao vivo" : "atualização periódica"}
        </span>
        <span className="mt-1 block truncate text-[16px] font-bold text-foreground">
          {error
            ? "Avisos indisponíveis"
            : loading
              ? "Buscando avisos…"
              : first
                ? first.title
                : "Nenhum aviso recebido"}
        </span>
        <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
          {error
            ? "Toque para tentar novamente"
            : loading
              ? "Consultando a região"
              : first
                ? `${distanciaCurta(first.distance_km)} de você · ${alerts.length} aviso${alerts.length === 1 ? "" : "s"} na região`
                : "Viu um perigo? Avise quem vem depois."}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function CommunitySheet({
  title,
  description,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 ${camada("fundoModal")} bg-black/55`} />
        <Dialog.Content
          className={`fixed bottom-0 left-1/2 ${camada("fundoModal")} max-h-[85dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl border border-white/15 bg-map-panel p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-map outline-none`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[22px] font-bold leading-tight text-foreground">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              disabled={busy}
              aria-label="Fechar avisos"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-full border border-white/15 text-foreground disabled:opacity-40"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CommunityReportSheet({
  onPublish,
  onClose,
}: {
  onPublish: (report: RoadReport) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<(typeof ROAD_REPORTS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const publish = async () => {
    if (!selected || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onPublish({ type: selected.type, title: selected.title });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível publicar. Tente novamente.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <CommunitySheet
      title={sent ? "Aviso publicado" : "O que aconteceu?"}
      description={
        sent
          ? "Seu aviso já pode ser consultado pelos motociclistas da região."
          : "Avise com a moto parada. O aviso será marcado na sua localização atual."
      }
      onClose={onClose}
      busy={busy}
    >
      {sent ? (
        <div className="mt-5">
          <p
            role="status"
            className="rounded-2xl bg-gold/10 p-4 text-[16px] font-semibold text-gold"
          >
            {selected?.title}
          </p>
          <button
            onClick={onClose}
            className="mt-4 min-h-[52px] w-full rounded-2xl bg-gold text-[16px] font-bold text-black"
          >
            Voltar ao mapa
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {ROAD_REPORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-pressed={selected?.id === item.id}
                onClick={() => {
                  setSelected(item);
                  setError(null);
                }}
                className={`flex min-h-[94px] flex-col items-start justify-center gap-2 rounded-2xl border p-4 text-left text-[14px] font-semibold ${selected?.id === item.id ? "border-gold bg-gold/15 text-gold" : "border-white/15 bg-white/5 text-foreground"}`}
              >
                <item.icon size={25} />
                {item.label}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-[14px] text-emergency">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => void publish()}
            className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gold px-3 text-[16px] font-bold text-black disabled:opacity-40"
          >
            {busy ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Localizando e publicando…
              </>
            ) : selected ? (
              "Publicar aviso aqui"
            ) : (
              "Escolha o tipo de perigo"
            )}
          </button>
        </>
      )}
    </CommunitySheet>
  );
}

export function CommunityAlertsSheet({
  alerts,
  loading,
  error,
  onRefresh,
  onReport,
  onClose,
  selectedId,
  onShowAll,
}: {
  alerts: NearbyAlert[];
  loading: boolean;
  error: Error | null;
  onRefresh: () => void;
  onReport: () => void;
  onClose: () => void;
  selectedId?: string | null;
  onShowAll?: () => void;
}) {
  return (
    <CommunitySheet
      title={selectedId ? "Aviso no mapa" : "Avisos por perto"}
      description="Relatos da comunidade nas últimas 24 horas, em um raio de até 25 km. A distância é em linha reta."
      onClose={onClose}
    >
      <div className="mt-4 flex gap-2">
        <button
          onClick={onReport}
          className="min-h-[48px] flex-1 rounded-xl bg-gold px-3 text-[15px] font-bold text-black"
        >
          Avisar perigo
        </button>
        <button
          onClick={onRefresh}
          className="min-h-[48px] rounded-xl border border-white/15 px-4 text-[14px] text-foreground"
        >
          Atualizar
        </button>
      </div>
      {loading && (
        <p role="status" className="mt-4 text-[14px] text-muted-foreground">
          Buscando avisos…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[14px] text-emergency">
          Não foi possível atualizar os avisos. Tente novamente.
        </p>
      )}
      {!loading && !error && alerts.length === 0 && (
        <p className="mt-5 text-[15px] text-muted-foreground">
          Nenhum aviso recebido por aqui. Isso não garante que a via esteja livre de perigos.
        </p>
      )}
      {selectedId && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 min-h-[44px] text-[14px] font-semibold text-gold"
        >
          Ver todos os avisos próximos
        </button>
      )}
      {selectedId && !alerts.some((alert) => alert.id === selectedId) && (
        <p role="status" className="mt-3 text-[14px] text-muted-foreground">
          Este aviso não está mais entre os relatos disponíveis na região.
        </p>
      )}
      <div className="mt-4 space-y-3">
        {sortNearbyAlerts(alerts)
          .filter((alert) => !selectedId || alert.id === selectedId)
          .map((alert) => (
            <article key={alert.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-gold">
                <span>{ALERT_LABEL[alert.type]}</span>
                <span>{distanciaCurta(alert.distance_km)}</span>
              </div>
              <h3 className="mt-2 break-words text-[17px] font-bold text-foreground">
                {alert.title}
              </h3>
              {alert.description && (
                <p className="mt-1 break-words text-[14px] text-muted-foreground">
                  {alert.description}
                </p>
              )}
              <p className="mt-2 text-[12px] text-muted-foreground">
                Relatado{" "}
                {new Date(alert.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {alert.is_mine ? "por você" : alert.author_name || "pela comunidade"}
              </p>
            </article>
          ))}
      </div>
    </CommunitySheet>
  );
}
