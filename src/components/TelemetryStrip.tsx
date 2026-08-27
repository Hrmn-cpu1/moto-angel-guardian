import type { ReactNode } from "react";
import { Gauge, Compass, Route, Clock, Volume2, VolumeX, Square } from "lucide-react";
import { camada } from "@/lib/layers";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";

/**
 * Telemetria compacta (RC3.1).
 *
 * O painel anterior era um cartão vertical alto que engolia o mapa. Aqui
 * velocidade, rumo e inclinação vivem numa única faixa de ~90 px: três
 * números grandes, três rótulos minúsculos e nada mais. Sem régua de
 * inclinação, sem repetir o destino (ele já está no topo).
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
      className={`${camada("painelInferior")} flex h-[58px] items-center gap-2 rounded-2xl border border-white/10 bg-black/80 px-3 backdrop-blur-md ${className ?? ""}`}
    >
      <Item
        icone={<Gauge size={11} />}
        valor={velocidade == null ? "—" : String(velocidade)}
        unidade="km/h"
        rotulo="Velocidade"
        destaque
      />
      <span className="h-7 w-px shrink-0 bg-white/10" />
      <Item
        icone={<Route size={11} />}
        valor={restanteKm == null ? "—" : restanteKm.toFixed(1).replace(".", ",")}
        unidade="km"
        rotulo="Restante"
      />
      <span className="h-7 w-px shrink-0 bg-white/10" />
      <Item
        icone={<Clock size={11} />}
        valor={etaMin == null ? "—" : String(etaMin)}
        unidade="min"
        rotulo="ETA"
      />
      <span className="hidden h-7 w-px shrink-0 bg-white/10 min-[380px]:block" />
      <div className="hidden min-[380px]:contents">
        <Item icone={<Compass size={11} />} valor={rumo ?? "—"} rotulo="Direção" />
      </div>
      <span className="sr-only">
        {inclinacao.graus == null ? "—" : `${inclinacao.graus}°`} de inclinação
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="hidden text-[9px] uppercase tracking-widest text-muted-foreground">
          {modo === "pilotando" ? "Em movimento" : "Parado"}
        </span>
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
        <button
          onClick={onFinalizar}
          aria-label="Finalizar viagem"
          className="rounded-full border border-white/15 p-1.5 text-muted-foreground"
        >
          <Square size={12} />
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
    <div className="min-w-0 flex-1">
      <p
        className={`flex items-baseline gap-1 leading-none tabular-nums ${
          destaque ? "text-[20px] font-bold text-foreground" : "text-base font-bold text-foreground"
        }`}
      >
        <span className="truncate">{valor}</span>
        {unidade && (
          <span className="text-[9px] font-semibold uppercase text-muted-foreground">
            {unidade}
          </span>
        )}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[8px] uppercase tracking-widest text-muted-foreground">
        <span className="shrink-0 text-gold">{icone}</span>
        <span className="truncate">{rotulo}</span>
      </p>
    </div>
  );
}
