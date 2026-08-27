import { ShieldCheck, Gauge, X } from "lucide-react";
import { camada } from "@/lib/layers";
import type { EventoNoMapa } from "@/lib/map-events";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";
import { rotuloDoDestino, type Viagem } from "@/lib/trip";
import { TelemetryStrip } from "@/components/TelemetryStrip";

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
 * Estado B — preparação
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
  onIniciar: () => void;
  onCancelar: () => void;
}

export function PreparacaoDeViagem({
  viagem,
  gpsOk,
  contato,
  segundoPlano = null,
  onIniciar,
  onCancelar,
}: PreparacaoProps) {
  const itens: Array<[string, string, boolean]> = [
    ["GPS", gpsOk ? "Ativo" : "Sem sinal", gpsOk],
    ["Escudo Moto Anjo", "Ativo", true],
    ["Acompanhamento", contato ?? "Nenhum contato", contato != null],
  ];
  if (segundoPlano) itens.push(["Segundo plano", segundoPlano.rotulo, segundoPlano.ok]);

  return (
    <div
      className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)] ${camada(
        "painelInferior",
      )} rounded-3xl border border-gold/30 bg-black/85 ma-card-pad backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
            Viagem segura
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {rotuloVisivel(viagem)}
          </p>
        </div>
        <button
          onClick={onCancelar}
          aria-label="Cancelar destino"
          className="shrink-0 rounded-full border border-white/10 p-2 text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {itens.map(([rotulo, valor, ok]) => (
          <li key={rotulo} className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{rotulo}</span>
            <span className={ok ? "font-semibold text-gold" : "text-muted-foreground"}>
              {valor}
            </span>
          </li>
        ))}
      </ul>

      {/* Sem contato de acompanhamento a viagem continua: avisar é útil,
          bloquear seria transformar segurança em obstáculo. */}
      {!contato && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Sem contato de acompanhamento, o SOS continua funcionando — mas ninguém será avisado
          automaticamente.
        </p>
      )}

      {/* A viagem NUNCA é bloqueada por isto: sem notificação ela roda em
          primeiro plano. O que não pode é o app dizer que protege com a tela
          apagada quando o Android negou o aviso permanente. */}
      {segundoPlano && !segundoPlano.ok && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Sem a notificação da viagem, o Moto Anjo não consegue mostrar nada na tela de bloqueio.
          Ative as notificações do app nas configurações do Android.
        </p>
      )}

      <button
        onClick={onIniciar}
        className="mt-3 flex ma-cta-h w-full items-center justify-center gap-2 rounded-2xl gold-gradient text-sm font-bold text-black"
      >
        <ShieldCheck size={16} /> Iniciar viagem segura
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
  vozLigada,
  vozSuportada,
  onAlternarVoz,
  onFinalizar,
}: CockpitProps) {
  return (
    <>
      {/* Telemetria compacta: uma faixa, ~58 px. O próximo evento agora vive
          no Copiloto adaptativo (V2), sem um segundo cartão sobre o mapa. */}
      <TelemetryStrip
        velocidade={velocidade}
        rumo={rumo}
        inclinacao={inclinacao}
        modo={modo}
        restanteKm={restanteKm}
        etaMin={etaMin}
        vozLigada={vozLigada}
        vozSuportada={vozSuportada}
        onAlternarVoz={onAlternarVoz}
        onFinalizar={onFinalizar}
        className="absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)]"
      />
    </>
  );
}

/* ================================================================== *
 * Estado A — chamada para começar
 * ================================================================== */

export function ChamadaViagemSegura({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)] ${camada(
        "painelInferior",
      )} flex ma-cta-h items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-black/80 text-sm font-bold uppercase tracking-widest text-gold backdrop-blur`}
    >
      <Gauge size={16} /> Iniciar viagem segura
    </button>
  );
}
