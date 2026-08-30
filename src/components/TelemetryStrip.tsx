import { ShieldCheck, Square } from "lucide-react";
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
  copiloto = null,
  copilotoCritico = false,
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
  /**
   * Linha do Copiloto de Segurança. `null` quando não há nada verdadeiro a
   * dizer — a faixa simplesmente não mostra a linha.
   */
  copiloto?: string | null;
  copilotoCritico?: boolean;
  vozLigada: boolean;
  vozSuportada: boolean;
  onAlternarVoz: () => void;
  onFinalizar: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="telemetria-compacta"
      className={`${camada("painelInferior")} rounded-2xl bg-map-panel/96 px-3 py-2 shadow-map backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 items-end gap-1">
          <Item valor={velocidade == null ? "—" : String(velocidade)} rotulo="km/h" destaque />
          <Item
            valor={restanteKm == null ? "—" : `${restanteKm.toFixed(1).replace(".", ",")}`}
            rotulo="restante"
            sufixo="km"
          />
          <Item valor={etaMin == null ? "—" : String(etaMin)} rotulo="chegada" sufixo="min" />
        </div>

        <button
          onClick={onFinalizar}
          aria-label="Finalizar viagem"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emergency/12 text-emergency"
        >
          <Square size={13} />
        </button>
      </div>
      {/* Copiloto: UMA linha, dentro da mesma faixa. Contexto de segurança —
          nunca repete a instrução de navegação, nunca inventa perigo. */}
      {copiloto && (
        <p
          data-testid="copiloto-na-faixa"
          className={`mt-2 flex items-center gap-1.5 border-t border-foreground/8 pt-2 text-[11px] font-semibold leading-tight ${
            copilotoCritico ? "text-emergency" : "text-muted-foreground"
          }`}
        >
          <ShieldCheck size={13} className={copilotoCritico ? "text-emergency" : "text-gold"} />
          <span className="truncate">
            <span className="text-gold">Copiloto</span> · {copiloto}
          </span>
        </p>
      )}

      {/* Contexto que não merece pixel na faixa, mas segue disponível para
          leitores de tela — nada é inventado nem escondido do usuário. */}
      <span className="sr-only">
        Direção {rumo ?? "indisponível"} ·{" "}
        {inclinacao.graus == null ? "inclinação indisponível" : `${inclinacao.graus}°`} ·{" "}
        {modo === "pilotando" ? "Em movimento" : "Parado"}
        {vozSuportada ? ` · Avisos por voz ${vozLigada ? "ligados" : "desligados"}` : ""}
      </span>
      {vozSuportada && (
        <button type="button" onClick={onAlternarVoz} className="sr-only">
          Alternar avisos por voz
        </button>
      )}
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
          destaque
            ? "font-display text-[30px] font-black text-gold"
            : "font-display text-[24px] font-bold text-foreground"
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
