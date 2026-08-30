import { ShieldCheck, X, Loader2, AlertTriangle, Flag } from "lucide-react";
import { camada } from "@/lib/layers";
import type { EventoNoMapa } from "@/lib/map-events";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";
import { rotuloDoDestino, type Viagem } from "@/lib/trip";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import type { EstadoDaRota, RouteInfo } from "@/components/RealMap";

/**
 * Cockpit da Viagem Segura.
 *
 * Regras que valem para todo este arquivo, porque quem lê está pilotando:
 *   . número grande e poucos deles;
 *   . nenhum dado inventado — sem sinal, aparece "—";
 *   . nada cobre o botão SOS nem a atribuição do Google;
 *   . nenhuma animação decorativa.
 */

/** Uma fonte só para o rótulo (`trip.ts`); aqui só o texto de espera. */
function rotuloVisivel(v: Viagem): string {
  return rotuloDoDestino(v) || "Destino";
}

/* ================================================================== *
 * Estado B — prévia da rota + preparação
 * ================================================================== */

interface PreparacaoProps {
  viagem: Viagem;
  gpsOk: boolean;
  contato: string | null;
  /**
   * Estado do segundo plano ANTES de começar — é aqui que ainda dá para
   * resolver. `null` fora do Android: nada a prometer onde não há serviço.
   */
  segundoPlano?: { ok: boolean; rotulo: string } | null;
  /** Rota REAL do Google. `null` enquanto não existe — nada é estimado. */
  rota?: RouteInfo | null;
  /** Estado do cálculo, para a prévia nunca ficar em silêncio. */
  estadoDaRota?: EstadoDaRota;
  onIniciar: () => void;
  onCancelar: () => void;
}

/**
 * Prévia da viagem.
 *
 * Hierarquia: DESTINO · (ETA + DISTÂNCIA reais) · checagens curtas · UM CTA.
 * O CTA é único no app inteiro — a faixa de destino não repete "iniciar".
 */
export function PreparacaoDeViagem({
  viagem,
  gpsOk,
  contato,
  segundoPlano = null,
  rota = null,
  estadoDaRota = "sem_destino",
  onIniciar,
  onCancelar,
}: PreparacaoProps) {
  return (
    <div
      data-testid="previa-da-rota"
      className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+10px)] ${camada(
        "painelInferior",
      )} rounded-2xl bg-map-panel/96 p-3 shadow-map backdrop-blur-xl`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0 pl-1">
          <p className="truncate font-display text-sm font-bold text-foreground">
            {rotuloVisivel(viagem)}
          </p>
          {rota ? (
            <p className="mt-0.5 text-xs font-bold text-gold tabular-nums">
              {rota.duracaoMin} min <span className="text-muted-foreground">•</span>{" "}
              {rota.distanciaKm.toFixed(1).replace(".", ",")} km
            </p>
          ) : (
            <p data-testid="estado-da-rota" className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {estadoDaRota === "calculando" ? (
                <><Loader2 size={11} className="animate-spin text-gold" /> Calculando rota…</>
              ) : estadoDaRota === "indisponivel" ? (
                <><AlertTriangle size={11} className="text-emergency" /> Rota indisponível</>
              ) : (
                <><Flag size={11} className="text-gold" /> Destino definido</>
              )}
            </p>
          )}
        </div>
        <button
          onClick={onIniciar}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gold px-4 font-display text-[11px] font-extrabold text-primary-foreground"
        >
          <ShieldCheck size={15} /> INICIAR VIAGEM SEGURA
        </button>
      </div>
      <div className="sr-only">
        GPS {gpsOk ? "ativo" : "sem sinal"}. Contato {contato ?? "nenhum"}. Segundo plano{" "}
        {segundoPlano?.rotulo ?? "indisponível"}.
      </div>
      <button
        onClick={onCancelar}
        aria-label="Cancelar destino"
        className="absolute -top-10 right-0 grid h-8 w-8 place-items-center rounded-full bg-map-panel/90 text-muted-foreground shadow-map backdrop-blur-xl"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ================================================================== *
 * Estado C — cockpit
 * ================================================================== */

interface CockpitProps {
  viagem: Viagem;
  velocidade: number | null;
  rumo: Cardeal | null;
  inclinacao: Inclinacao;
  modo: "parado" | "pilotando";
  proximoEvento: EventoNoMapa | null;
  /** Rota real do Google: distância restante e ETA. `null` sem rota. */
  restanteKm?: number | null;
  etaMin?: number | null;
  /** Uma linha de contexto do Copiloto. `null` quando não há nada honesto. */
  copiloto?: string | null;
  copilotoCritico?: boolean;
  vozLigada: boolean;
  vozSuportada: boolean;
  onAlternarVoz: () => void;
  onFinalizar: () => void;
}

export function CockpitDeViagem({
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
}: CockpitProps) {
  return (
    <>
      {/* Telemetria compacta: uma faixa, ~58 px. O Copiloto entra como UMA
          linha dentro dela — durante a viagem, um cartão separado só somava
          mais uma caixa flutuando sobre o mapa. */}
      <TelemetryStrip
        velocidade={velocidade}
        rumo={rumo}
        inclinacao={inclinacao}
        modo={modo}
        restanteKm={restanteKm}
        etaMin={etaMin}
        copiloto={copiloto}
        copilotoCritico={copilotoCritico}
        vozLigada={vozLigada}
        vozSuportada={vozSuportada}
        onAlternarVoz={onAlternarVoz}
        onFinalizar={onFinalizar}
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+12px)] left-3 right-[68px]"
      />
    </>
  );
}

/* ================================================================== *
 * Estado A — chamada para começar
 * ================================================================== */

export function ChamadaViagemSegura({ onAbrir }: { onAbrir: () => void }) {
  return <button onClick={onAbrir} className="sr-only">Iniciar viagem segura</button>;
}
