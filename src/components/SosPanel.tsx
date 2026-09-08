import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { camada } from "@/lib/layers";
import {
  allowsManualSend,
  claimsDelivery,
  sosDeliveryLabel,
  sosPanelTitle,
} from "@/lib/sos-client";
import { abrirUrlExterna } from "@/lib/external-navigation";
import type { SosController } from "@/hooks/useSosController";

export type SosPanelLayout = "overlay" | "inline" | "page";

interface Props {
  sos: SosController;
  layout?: SosPanelLayout;
  /** Rota para cadastrar contatos, quando o usuário não tem nenhum. */
  onAddContacts?: () => void;
  className?: string;
}

const FASES_EM_CURSO = new Set(["localizando", "registrando", "cancelando"]);

/**
 * Painel único de emergência.
 *
 * Usado igual nos três acionadores. O texto aqui é deliberadamente literal:
 * "mensagem pronta" não é "enviada", e "aceita pela API" não é "entregue".
 * A palavra entregue só aparece quando o webhook do provedor confirmou —
 * qualquer outra coisa seria prometer à pessoa uma ajuda que talvez não venha.
 */
export function SosPanel({ sos, layout = "overlay", onAddContacts, className }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sos.open || layout === "page") return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;
    const controls = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'),
      );
    (controls()[0] ?? panel).focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const keepFocus = () => {
      if (!panel.contains(document.activeElement)) (controls()[0] ?? panel).focus();
    };
    // Realtime status can remove the currently focused send/cancel control.
    const observer = new MutationObserver(keepFocus);
    observer.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    document.addEventListener("focusin", keepFocus);
    panel.addEventListener("keydown", trapFocus);
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", keepFocus);
      panel.removeEventListener("keydown", trapFocus);
      previous?.focus();
    };
  }, [sos.open, layout]);
  if (!sos.open) return null;

  const emCurso = FASES_EM_CURSO.has(sos.phase);
  const podeCancelar = Boolean(sos.sosEventId) && sos.phase !== "cancelando";
  const mostrarRetentativa =
    sos.phase === "gps_recusado" || sos.phase === "falha_registro" || sos.phase === "sem_internet";
  const titulo = sosPanelTitle(
    sos.phase,
    sos.recipients.map((recipient) => recipient.state),
    sos.phaseLabel,
  );

  const corpo = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal={layout !== "page"}
      aria-label="Painel de emergência"
      onKeyDown={(event) => {
        if (event.key === "Escape" && layout !== "page") {
          event.stopPropagation();
          sos.closePanel();
        }
      }}
      className={cn(
        "w-full rounded-3xl border border-white/15 bg-map-panel p-5 shadow-map outline-none",
        layout !== "page" && "mx-auto max-w-md overflow-y-auto overscroll-contain",
        layout === "overlay" &&
          "max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top))-max(1rem,env(safe-area-inset-bottom)))]",
        layout === "inline" && "max-h-full",
        layout === "page" && "rounded-3xl p-5",
      )}
    >
      {/* Cabeçalho ------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-emergency">
            {sos.sosEventId ? "SOS aberto" : "Acionando SOS"}
          </p>
          <p className="mt-2 text-lg font-bold leading-snug text-foreground">{titulo}</p>
        </div>
        {layout !== "page" && (
          <button
            type="button"
            onClick={sos.closePanel}
            aria-label="Fechar painel — o SOS continua aberto"
            className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {emCurso && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin text-gold" /> {sos.phaseLabel}...
        </p>
      )}

      {/* Posição --------------------------------------------------------- */}
      {sos.fix && (
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-muted-foreground">
          <MapPin size={15} className="shrink-0 text-gold" />
          {sos.fix.lat.toFixed(5)}, {sos.fix.lng.toFixed(5)}
          {sos.fix.accuracy != null && ` · ±${Math.round(sos.fix.accuracy)} m`}
        </p>
      )}

      {sos.degradedWarning && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-2.5 text-sm leading-relaxed text-gold">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {sos.degradedWarning}
        </p>
      )}

      {sos.errorMessage && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 p-2.5 text-sm leading-relaxed text-emergency">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {sos.errorMessage}
        </p>
      )}

      {mostrarRetentativa && (
        <button
          type="button"
          onClick={sos.retry}
          disabled={sos.busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-gold disabled:opacity-50"
        >
          <RotateCcw size={13} /> {sos.busy ? "Tentando..." : "Tentar de novo"}
        </button>
      )}

      {/* Destinatários --------------------------------------------------- */}
      {!emCurso && (
        <div className="mt-4">
          {sos.hasContacts ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <MessageCircle size={16} className="text-gold" /> Contatos de emergência
                </span>
                <span className="text-xs text-muted-foreground">
                  {sos.recipients.length} contato{sos.recipients.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                {sos.recipients.some((recipient) => allowsManualSend(recipient.state))
                  ? "Onde aparecer Enviar, toque e conclua o envio no WhatsApp."
                  : "Acompanhe abaixo a confirmação de cada aviso."}
              </p>
              <div className="space-y-2">
                {sos.recipients.map((r) => {
                  const manual = allowsManualSend(r.state);
                  const confirmado = claimsDelivery(r.state);

                  const identidade = (
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-foreground">
                        {r.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{r.phone}</span>
                      <span
                        className={cn(
                          "mt-2 flex items-start gap-1.5 text-xs leading-relaxed",
                          confirmado
                            ? "text-gold"
                            : r.state === "enviando"
                              ? "text-muted-foreground"
                              : r.state === "recusada_pelo_provedor"
                                ? "text-emergency"
                                : "text-muted-foreground",
                        )}
                      >
                        {confirmado && <ShieldCheck size={10} />}
                        {r.state === "enviando" && <Loader2 size={10} className="animate-spin" />}
                        {sosDeliveryLabel(r.state)}
                      </span>
                    </span>
                  );

                  // Estados em que a API já está com a mensagem: o botão manual
                  // some para a pessoa não mandar o mesmo aviso duas vezes.
                  if (!manual) {
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                          confirmado ? "border-gold/30 bg-gold/5" : "border-white/10 bg-black/40",
                        )}
                      >
                        {identidade}
                      </div>
                    );
                  }

                  return (
                    // Botão, não <a target="_blank">: dentro do APK o link do
                    // wa.me redireciona para esquema de aplicativo e podia
                    // levar a WebView do SOS para uma página de erro. O toque
                    // continua obrigatório — nada abre sozinho.
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        void abrirUrlExterna(r.href);
                        sos.markOpened(r.id);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/5 px-4 py-3 text-left transition hover:bg-gold/10"
                    >
                      {identidade}
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gold">
                        <Send size={12} />
                        {r.state === "recusada_pelo_provedor" ? "Enviar à mão" : "Enviar"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center">
              <p className="text-sm text-muted-foreground">
                Você ainda não tem contato de emergência cadastrado.
              </p>
              {onAddContacts && (
                <button
                  type="button"
                  onClick={onAddContacts}
                  className="mt-2 text-xs font-semibold text-gold underline"
                >
                  Cadastrar um contato agora
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ações ----------------------------------------------------------- */}
      {!emCurso && (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => void sos.shareNative()}
            className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-bold text-gold"
          >
            <Send size={13} /> Compartilhar alerta
          </button>
          {podeCancelar && (
            <button
              type="button"
              onClick={sos.cancel}
              className="flex w-full items-center justify-center gap-2 min-h-[48px] rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-foreground"
            >
              <X size={13} /> Cancelar SOS
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        Risco de vida? Ligue 190 · 192 · 193
      </p>
    </div>
  );

  if (layout === "page") return <div className={className}>{corpo}</div>;

  return (
    <div
      className={cn(
        // Camada do topo, da escala única. O mapa está isolado, então nada
        // de dentro dele alcança este painel (RC3 bug #2).
        camada("painelSos"),
        "flex items-end bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        layout === "overlay" ? "fixed inset-0" : "absolute inset-0",
        className,
      )}
    >
      {corpo}
    </div>
  );
}
