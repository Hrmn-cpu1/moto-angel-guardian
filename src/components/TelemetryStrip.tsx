import type { ReactNode } from "react";
import { Gauge, Compass, Route, Clock, Volume2, VolumeX, Square } from "lucide-react";
import { camada } from "@/lib/layers";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";

/**
 * Telemetria compacta (V2.1).
 *
 * Três números que importam pilotando — velocidade, distância restante e
 * chegada — com rótulos INTEIROS: nada de "VELOC..." ou "RESTAN...". A grade
 * é fluida (`minmax(0,1fr)`) e cada célula tem `min-w-0`, então em telas
 * Android estreitas o texto encolhe de tamanho antes de ser cortado.
 *
 * Regra preservada: sem dado confiável, aparece "—". Nunca um número
 * fabricado para a faixa parecer completa.
 */
export function TelemetryStrip({
  velocidade,
  rumo,
  inclinacao,
  modo,
  restanteKm = null,
  etaMin = null,
  vozLigada,
  vozSuportada,
  onAlternarVoz,
  onFinalizar,
  className,
}: {
  velocidade: number | null;
  rumo: Cardeal | null;
  inclinacao: Inclinacao;
  modo: "parado" | "pilotando";
  /** Distância restante da rota real. `null` sem rota — nada é estimado. */
  restanteKm?: number | null;
  /** Tempo restante da rota real, em minutos. */
  etaMin?: number | null;
  vozLigada: boolean;
  vozSuportada: boolean;
  onAlternarVoz: () => void;
  onFinalizar: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="telemetria-compacta"
      className={`${camada("painelInferior")} flex items-center gap-2 rounded-2xl border border-white/10 bg-black/85 px-3 py-2 backdrop-blur-md ${className ?? ""}`}
    >
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2">
        <Item
          icone={<Gauge size={10} />}
          valor={velocidade == null ? "—" : String(velocidade)}
          unidade="km/h"
          rotulo="Velocidade"
          destaque
        />
        <Item
          icone={<Route size={10} />}
          valor={restanteKm == null ? "—" : restanteKm.toFixed(1).replace(".", ",")}
          unidade="km"
          rotulo="Distância"
        />
        <Item
          icone={<Clock size={10} />}
          valor={etaMin == null ? "—" : String(etaMin)}
          unidade="min"
          rotulo="Chegada"
        />
      </div>

      {/* Direção é contexto, não decisão: fica menor e some em telas estreitas. */}
      <div className="hidden shrink-0 items-center gap-1 border-l border-white/10 pl-2 text-[10px] font-semibold text-muted-foreground min-[400px]:flex">
        <Compass size={10} className="text-gold" />
        <span className="tabular-nums">{rumo ?? "—"}</span>
      </div>
      <span className="sr-only">
        {inclinacao.graus == null ? "—" : `${inclinacao.graus}°`} de inclinação ·{" "}
        {modo === "pilotando" ? "Em movimento" : "Parado"}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {vozSuportada && (
          <button
            onClick={onAlternarVoz}
            role="switch"
            aria-checked={vozLigada}
            aria-label="Avisos por voz"
            className={`rounded-full border p-1.5 ${
              vozLigada ? "border-gold/50 text-gold" : "border-white/15 text-muted-foreground"
            }`}
          >
            {vozLigada ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>
        )}
        {/* Ícone quadrado sozinho era ambíguo: agora diz o que faz. */}
        <button
          onClick={onFinalizar}
          aria-label="Finalizar viagem"
          className="flex items-center gap-1.5 rounded-full border border-emergency/40 bg-emergency/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emergency"
        >
          <Square size={11} /> <span className="hidden min-[340px]:inline">Finalizar</span>
        </button>
      </div>
    </div>
  );
}

function Item({
  icone,
  valor,
  unidade,
  rotulo,
  destaque,
}: {
  icone: ReactNode;
  valor: string;
  unidade?: string;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-1 text-[8px] font-semibold uppercase leading-none tracking-[0.06em] text-muted-foreground">
        <span className="shrink-0 text-gold">{icone}</span>
        <span className="min-w-0">{rotulo}</span>
      </p>
      <p
        className={`mt-1 flex min-w-0 items-baseline gap-1 leading-none tabular-nums ${
          destaque
            ? "text-[22px] font-black text-foreground"
            : "text-[17px] font-bold text-foreground"
        }`}
      >
        <span className="truncate">{valor}</span>
        {unidade && (
          <span className="shrink-0 text-[9px] font-semibold uppercase text-muted-foreground">
            {unidade}
          </span>
        )}
      </p>
    </div>
  );
}
