import { ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, RefreshCw } from "lucide-react";
import { camada } from "@/lib/layers";
import {
  acaoDaManobra,
  distanciaDaManobra,
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
 * Próxima manobra — a informação dominante do cockpit (V2.1).
 *
 * Hierarquia de leitura em 0,5 s: seta → distância → rua → ação. Só aparece
 * quando o Google devolveu um passo real; nada é estimado nem inventado.
 * O cartão é compacto na vertical para devolver mapa à tela.
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
  // Limite maior que o da notificação: aqui há espaço para duas linhas.
  const via = viaDaInstrucao(rota?.proximaInstrucao, 64);
  const distancia = distanciaDaManobra(rota?.proximaDistanciaM);
  if (!via) return null;

  const Seta = SETAS[setaDaManobra(rota?.proximaManobra)];
  const acao = acaoDaManobra(rota?.proximaManobra);

  return (
    <div
      data-testid="proxima-manobra"
      className={`${camada("cartoesDoMapa")} grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-white/10 bg-black/85 px-3 py-2.5 backdrop-blur-md ${className ?? ""}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15">
        <Seta size={26} className="text-gold" />
      </span>
      <div className="min-w-0">
        {distancia && (
          <p className="text-[30px] font-black leading-none text-gold tabular-nums">{distancia}</p>
        )}
        <p className="mt-1 break-words text-[15px] font-bold leading-tight text-foreground [overflow-wrap:anywhere]">
          {via}
        </p>
        {(acao || destino) && (
          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
            {acao ?? `para ${destino}`}
          </p>
        )}
      </div>
    </div>
  );
}
