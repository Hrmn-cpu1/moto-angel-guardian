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

  return (
    <div
      className={`${camada("cartoesDoMapa")} flex items-center gap-2.5 rounded-2xl border bg-black/80 px-3 py-2 backdrop-blur-md ${className ?? ""}`}
      style={{ borderColor: `${cor}55` }}
      aria-live="polite"
    >
      <ShieldCheck size={16} className="shrink-0" style={{ color: cor }} />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-gold">Copiloto</p>
        <p className="truncate text-[11px] text-foreground">
          {aviso
            ? `${APARENCIA[aviso.categoria].rotulo} a ${distanciaCurta(aviso.distanciaKm)}`
            : viagemAtiva
              ? "Rota tranquila até agora."
              : "Pronto para a viagem."}
        </p>
      </div>
    </div>
  );
}
