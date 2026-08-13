import { ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, RefreshCw } from "lucide-react";
import { camada } from "@/lib/layers";
import { distanciaDaManobra, setaDaManobra, viaDaInstrucao } from "@/lib/navigation-cue";
import type { RouteInfo } from "@/components/RealMap";

const SETAS = {
  esquerda: CornerUpLeft,
  direita: CornerUpRight,
  frente: ArrowUp,
  retorno: RotateCcw,
  rotatoria: RefreshCw,
} as const;

/**
 * Próxima manobra — a informação mais importante durante a viagem.
 *
 * Só aparece quando o Google devolveu um passo real. Sem rota, sem faixa:
 * não existe seta genérica nem distância estimada.
 */
export function NextManeuver({ rota, className }: { rota: RouteInfo | null; className?: string }) {
  const via = viaDaInstrucao(rota?.proximaInstrucao);
  const distancia = distanciaDaManobra(rota?.proximaDistanciaM);
  if (!via) return null;

  const Seta = SETAS[setaDaManobra(rota?.proximaManobra)];

  return (
    <div
      data-testid="proxima-manobra"
      className={`${camada("cartoesDoMapa")} flex items-center gap-3 rounded-2xl border border-gold/30 bg-black/85 px-3 py-2 backdrop-blur-md ${className ?? ""}`}
    >
      <Seta size={22} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        {distancia && (
          <p className="text-lg font-bold leading-none text-foreground tabular-nums">{distancia}</p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{via}</p>
      </div>
    </div>
  );
}