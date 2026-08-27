import { Volume2, VolumeX, Square } from "lucide-react";
import { camada } from "@/lib/layers";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";

/**
 * Cockpit inferior (V3).
 *
 * Três números e nada mais: VELOCIDADE · RESTANTE · CHEGADA. Cada um tem o
 * valor grande em cima e a unidade/rótulo curto embaixo, em caixa alta, sem
 * ícone e sem qualquer palavra que precise ser cortada. A direção cardeal saiu
 * da faixa: quem pilota já vê para onde vai no mapa e na manobra.
 *
 * Regra preservada: sem dado confiável aparece "—". Nunca um número fabricado.
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
      className={`${camada("painelInferior")} rounded-2xl border-t-2 border-gold/70 bg-[#0A0A0A]/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 items-end gap-1">
          <Item
            valor={velocidade == null ? "—" : String(velocidade)}
            rotulo="km/h"
            destaque
          />
          <Item
            valor={restanteKm == null ? "—" : `${restanteKm.toFixed(1).replace(".", ",")}`}
            rotulo="restante"
            sufixo="km"
          />
          <Item
            valor={etaMin == null ? "—" : String(etaMin)}
            rotulo="chegada"
            sufixo="min"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-l border-white/10 pl-2">
          {vozSuportada && (
            <button
              onClick={onAlternarVoz}
              role="switch"
              aria-checked={vozLigada}
              aria-label="Avisos por voz"
              className={`grid h-9 w-9 place-items-center rounded-full border ${
                vozLigada ? "border-gold/60 text-gold" : "border-white/15 text-muted-foreground"
              }`}
            >
              {vozLigada ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          )}
          <button
            onClick={onFinalizar}
            aria-label="Finalizar viagem"
            className="flex h-9 items-center gap-1.5 rounded-full border border-emergency/50 bg-emergency/10 px-3 text-[11px] font-bold uppercase tracking-wide text-emergency"
          >
            <Square size={12} /> <span className="hidden min-[340px]:inline">Finalizar</span>
          </button>
        </div>
      </div>

      {/* Contexto que não merece pixel na faixa, mas segue disponível para
          leitores de tela — nada é inventado nem escondido do usuário. */}
      <span className="sr-only">
        Direção {rumo ?? "indisponível"} ·{" "}
        {inclinacao.graus == null ? "inclinação indisponível" : `${inclinacao.graus}° de inclinação`}{" "}
        · {modo === "pilotando" ? "Em movimento" : "Parado"}
      </span>
    </div>
  );
}

function Item({
  valor,
  rotulo,
  sufixo,
  destaque,
}: {
  valor: string;
  rotulo: string;
  sufixo?: string;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`flex min-w-0 items-baseline gap-1 leading-none tabular-nums ${
          destaque ? "text-[30px] font-black text-gold" : "text-[24px] font-bold text-foreground"
        }`}
      >
        <span className="truncate">{valor}</span>
        {sufixo && (
          <span className="shrink-0 text-[11px] font-bold uppercase text-muted-foreground">
            {sufixo}
          </span>
        )}
      </p>
      <p className="mt-1 truncate text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground">
        {rotulo}
      </p>
    </div>
  );
}
