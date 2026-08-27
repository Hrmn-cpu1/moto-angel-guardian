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
 * Próxima manobra — a informação dominante do cockpit (V2).
 *
 * Só aparece quando o Google devolveu um passo real. Sem rota, sem faixa:
 * não existe seta genérica nem distância estimada. A hierarquia é seta →
 * distância → via; a linha secundária (destino) só entra quando existe e
 * nunca compete com as duas primeiras.
 */
export function NextManeuver({
  rota,
  destino,
  className,
}: {
  rota: RouteInfo | null;
  /** Rótulo do destino, se houver. Apenas contexto — nunca inventado. */
  destino?: string | null;
  className?: string;
}) {
  const via = viaDaInstrucao(rota?.proximaInstrucao);
  const distancia = distanciaDaManobra(rota?.proximaDistanciaM);
  if (!via) return null;

  const Seta = SETAS[setaDaManobra(rota?.proximaManobra)];

  return (
    <div
      data-testid="proxima-manobra"
      className={`${camada("cartoesDoMapa")} flex items-center gap-3 rounded-2xl border border-white/10 bg-black/85 px-4 py-3 backdrop-blur-md ${className ?? ""}`}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/15">
        <Seta size={28} className="text-gold" />
      </span>
      <div className="min-w-0 flex-1">
        {distancia && (
          <p className="text-[28px] font-black leading-none text-gold tabular-nums">{distancia}</p>
        )}
        <p className="mt-1 truncate text-sm font-semibold leading-tight text-foreground">{via}</p>
        {destino && (
          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
            para {destino}
          </p>
        )}
      </div>
    </div>
  );
}
