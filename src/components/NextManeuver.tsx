import { ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, RefreshCw } from "lucide-react";
import { camada } from "@/lib/layers";
import {
  distanciaDaManobra,
  instrucaoDaManobra,
  setaDaManobra,
  viaDaInstrucao,
} from "@/lib/navigation-cue";
import type { RouteInfo } from "@/components/RealMap";

const SETAS = {
  esquerda: CornerUpLeft,
  direita: CornerUpRight,
  frente: ArrowUp,
  retorno: RotateCcw,
  rotatoria: RefreshCw,
} as const;

/**
 * Próxima manobra — bloco dominante do Cockpit V3.
 *
 * Hierarquia fixa, lida em menos de meio segundo pilotando:
 *   seta · DISTÂNCIA (enorme) · AÇÃO (grande) · rua (secundária).
 *
 * A frase longa do Google nunca é exibida inteira: dela extraímos só o nome
 * da via. Sem manobra conhecida, a ação cai em um fallback neutro — nunca um
 * lado inventado. Sem passo real, o bloco simplesmente não existe.
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
  const via = viaDaInstrucao(rota?.proximaInstrucao, 56);
  const distancia = distanciaDaManobra(rota?.proximaDistanciaM);
  // Estado honesto: com rota calculada mas sem passo conhecido, o bloco não
  // some (a tela ficaria vazia no topo) nem inventa um lado — diz apenas para
  // seguir a rota desenhada no mapa. Sem rota alguma, nada é renderizado.
  if (!via && !distancia && !rota) return null;

  const Seta = SETAS[setaDaManobra(rota?.proximaManobra)];
  const acao =
    via || distancia
      ? instrucaoDaManobra(rota?.proximaManobra, rota?.proximaInstrucao)
      : "Siga a rota";

  return (
    <div
      data-testid="proxima-manobra"
      className={`${camada("cartoesDoMapa")} grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border-l-4 border-gold bg-[#0A0A0A]/95 py-3 pl-3 pr-4 shadow-[0_10px_30px_rgba(0,0,0,0.55)] ${className ?? ""}`}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gold text-black">
        <Seta size={34} strokeWidth={2.6} />
      </span>
      <div className="min-w-0">
        {distancia && (
          <p className="text-[38px] font-black leading-[0.95] tracking-tight text-gold tabular-nums">
            {distancia}
          </p>
        )}
        <p className="mt-0.5 truncate text-[19px] font-extrabold uppercase leading-tight tracking-tight text-foreground">
          {acao}
        </p>
        {(via || destino) && (
          <p className="mt-0.5 truncate text-[13px] font-medium leading-tight text-muted-foreground">
            {via ?? destino}
          </p>
        )}
      </div>
    </div>
  );
}
