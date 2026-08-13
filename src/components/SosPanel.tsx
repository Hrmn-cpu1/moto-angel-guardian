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
import { allowsManualSend, claimsDelivery, sosDeliveryLabel } from "@/lib/sos-client";
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
  if (!sos.open) return null;

  const emCurso = FASES_EM_CURSO.has(sos.phase);
  const podeCancelar = Boolean(sos.sosEventId) && sos.phase !== "cancelando";
  const mostrarRetentativa =
    sos.phase === "gps_recusado" || sos.phase === "falha_registro" || sos.phase === "sem_internet";

  const corpo = (
    <div
      role="dialog"
      aria-modal={layout !== "page"}
      aria-label="Painel de emergência"
      className={cn(
        "glass-card w-full rounded-2xl border-emergency/40 p-4",
        layout === "overlay" && "mx-auto max-w-md",
        layout === "page" && "rounded-3xl p-5",
      )}
    >
      {/* Cabeçalho ------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-emergency">
            {sos.sosEventId ? "SOS aberto" : "Acionando SOS"}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{sos.phaseLabel}</p>
        </div>
        {layout !== "page" && (
          <button
            type="button"
            onClick={sos.closePanel}
            aria-label="Fechar painel — o SOS continua aberto"
            className="rounded-full border border-white/15 p-1.5 text-muted-foreground"
          >
            <X size={14} />
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
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <MapPin size={12} className="text-gold" />
          {sos.fix.lat.toFixed(5)}, {sos.fix.lng.toFixed(5)}
          {sos.fix.accuracy != null && ` · ±${Math.round(sos.fix.accuracy)} m`}
        </p>
      )}

      {sos.degradedWarning && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-2.5 text-[11px] text-gold">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {sos.degradedWarning}
        </p>
      )}

      {sos.errorMessage && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 p-2.5 text-[11px] text-emergency">
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
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold">
                  <MessageCircle size={12} /> Avisar pelo WhatsApp
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {sos.recipients.length} contato{sos.recipients.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="mb-2 px-0.5 text-[11px] leading-snug text-muted-foreground">
                Toque nos contatos com o botão <strong className="text-foreground">Enviar</strong>{" "}
                para abrir o WhatsApp e mandar a mensagem você mesmo — por esse caminho o app não
                consegue saber se ela chegou. Quem já está com a API não mostra botão, para você não
                mandar o mesmo aviso duas vezes.
              </p>
              <div className="space-y-2">
                {sos.recipients.map((r) => {
                  const manual = allowsManualSend(r.state);
                  const confirmado = claimsDelivery(r.state);

                  const identidade = (
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {r.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.phone}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 truncate text-[10px] uppercase tracking-widest",
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
                          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                          confirmado ? "border-gold/30 bg-gold/5" : "border-white/10 bg-black/40",
                        )}
                      >
                        {identidade}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={r.id}
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => sos.markOpened(r.id)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-black/50 px-3 py-2.5 transition hover:bg-gold/10"
                    >
                      {identidade}
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-gold">
                        <Send size={12} />
                        {r.state === "recusada_pelo_provedor" ? "Enviar à mão" : "Enviar"}
                      </span>
                    </a>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">
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
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => void sos.shareNative()}
            className="flex w-full items-center justify-center gap-2 rounded-xl gold-gradient px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-black"
          >
            <Send size={13} /> Compartilhar alerta
          </button>
          {podeCancelar && (
            <button
              type="button"
              onClick={sos.cancel}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              <X size={13} /> Cancelar SOS
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
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
        "flex items-end bg-black/80 p-3 animate-fade-up",
        layout === "overlay" ? "fixed inset-0" : "absolute inset-0",
        className,
      )}
    >
      {corpo}
    </div>
  );
}
