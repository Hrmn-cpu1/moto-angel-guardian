import { ShieldCheck } from "lucide-react";
import { camada } from "@/lib/layers";
import { APARENCIA, distanciaCurta, type EventoNoMapa } from "@/lib/map-events";

/**
 * Copiloto Moto Anjo — leitura de contexto, não conversa.
 *
 * Só existem duas mensagens possíveis: o evento real mais relevante do
 * momento, ou o silêncio ("rota tranquila"). Nenhuma frase é gerada sem uma
 * linha de dado por trás.
 */
export function CopilotCard({
  aviso,
  viagemAtiva,
  className,
}: {
  aviso: EventoNoMapa | null;
  viagemAtiva: boolean;
  className?: string;
}) {
  const cor = aviso ? APARENCIA[aviso.categoria].cor : "#D4AF37";
  const mensagem = aviso
    ? `${APARENCIA[aviso.categoria].rotulo} a ${distanciaCurta(aviso.distanciaKm)} • atenção`
    : viagemAtiva
      ? "Rota tranquila • próximo alerta: nenhum"
      : "Pronto para a viagem";

  return (
    <div
      data-testid="copiloto-compacto"
      className={`${camada("cartoesDoMapa")} flex h-9 items-center gap-2 rounded-full border bg-black/80 px-3 backdrop-blur-md ${className ?? ""}`}
      style={{ borderColor: `${cor}55` }}
      aria-live="polite"
    >
      <ShieldCheck size={13} className="shrink-0" style={{ color: cor }} />
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.22em] text-gold">
        Copiloto
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{mensagem}</span>
    </div>
  );
}
