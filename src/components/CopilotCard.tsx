import { ShieldCheck, AlertTriangle } from "lucide-react";
import { camada } from "@/lib/layers";
import { APARENCIA, distanciaCurta, type EventoNoMapa } from "@/lib/map-events";

/**
 * Copiloto Moto Anjo — leitura de contexto, não conversa.
 *
 * Só existem duas mensagens possíveis: o evento real mais relevante do
 * momento, ou o silêncio ("rota tranquila"). Nenhuma frase é gerada sem uma
 * linha de dado por trás.
 *
 * V2: em estado normal é uma pílula discreta (h-9). Com alerta REAL ela
 * expande, porque aí a informação vale o espaço.
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
  if (aviso) {
    const { cor, rotulo } = APARENCIA[aviso.categoria];
    return (
      <div
        data-testid="copiloto-compacto"
        className={`${camada("cartoesDoMapa")} flex items-center gap-3 rounded-2xl border bg-black/85 px-3 py-2 backdrop-blur-md ${className ?? ""}`}
        style={{ borderColor: `${cor}66` }}
        aria-live="polite"
      >
        <AlertTriangle size={18} className="shrink-0" style={{ color: cor }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-none" style={{ color: cor }}>
            {rotulo}
          </p>
          <p className="mt-1 text-[11px] leading-none text-muted-foreground">
            {distanciaCurta(aviso.distanciaKm)} • atenção
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="copiloto-compacto"
      className={`${camada("cartoesDoMapa")} mx-auto flex h-9 w-fit max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 backdrop-blur-md ${className ?? ""}`}
      aria-live="polite"
    >
      <ShieldCheck size={13} className="shrink-0 text-gold" />
      <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
        {viagemAtiva ? "Rota tranquila" : "Pronto para a viagem"}
      </span>
    </div>
  );
}
