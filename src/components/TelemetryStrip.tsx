import { ShieldCheck, Square, Volume2, VolumeX } from "lucide-react";
import { camada } from "@/lib/layers";
import { SosHoldButton } from "@/components/SosHoldButton";
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
  onSosHoldComplete,
  sosDisabled = false,
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
  onSosHoldComplete: (heldMs: number) => void;
  sosDisabled?: boolean;
  className?: string;
}) {
  return (
    <div
      data-testid="telemetria-compacta"
      className={`${camada("painelInferior")} rounded-2xl border border-white/10 bg-map-panel/96 px-3 py-3 shadow-map backdrop-blur-xl ${className ?? ""}`}
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

        <SosHoldButton
          variant="compact"
          disabled={sosDisabled}
          onHoldComplete={onSosHoldComplete}
          className="shrink-0"
        />

        <button
          onClick={onFinalizar}
          aria-label="Finalizar viagem"
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 text-foreground"
        >
          <Square size={13} />
          <span className="text-[10px] font-semibold">Fim</span>
        </button>
      </div>
      {/* Copiloto: UMA linha, dentro da mesma faixa. Contexto de segurança —
          nunca repete a instrução de navegação, nunca inventa perigo. */}
      {(copiloto || vozSuportada) && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
          {copiloto && (
            <p
              data-testid="copiloto-na-faixa"
              className={`flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold leading-tight ${
                copilotoCritico ? "text-emergency" : "text-muted-foreground"
              }`}
            >
              <ShieldCheck size={13} className={copilotoCritico ? "text-emergency" : "text-gold"} />
              <span className="truncate">
                <span className="text-gold">Copiloto</span> · {copiloto}
              </span>
            </p>
          )}

          {vozSuportada && (
            <button
              type="button"
              onClick={onAlternarVoz}
              aria-label="Alternar avisos por voz"
              aria-pressed={vozLigada}
              className="ml-auto grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-white/10 text-gold"
            >
              {vozLigada ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          )}
        </div>
      )}

      {/* Contexto que não merece pixel na faixa, mas segue disponível para
          leitores de tela — nada é inventado nem escondido do usuário. */}
      <span className="sr-only">
        Direção {rumo ?? "indisponível"} ·{" "}
        {inclinacao.graus == null ? "inclinação indisponível" : `${inclinacao.graus}°`} ·{" "}
        {modo === "pilotando" ? "Em movimento" : "Parado"}
        {vozSuportada ? ` · Avisos por voz ${vozLigada ? "ligados" : "desligados"}` : ""}
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
          destaque
            ? "font-display text-[30px] font-black text-gold"
            : "font-display text-[24px] font-bold text-foreground"
        }`}
      >
        <span style={{ fontSize: valor.length > 4 ? "18px" : undefined }}>{valor}</span>
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
        {sufixo && <span className="block">{sufixo}</span>}
        {rotulo}
      </p>
    </div>
  );
}
