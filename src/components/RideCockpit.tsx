import { ShieldCheck, Gauge, X } from "lucide-react";
import { camada } from "@/lib/layers";
import { distanciaCurta, APARENCIA, type EventoNoMapa } from "@/lib/map-events";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";
import type { Viagem } from "@/lib/trip";
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

function rotuloDoDestino(v: Viagem): string {
  const d = v.destino;
  if (!d) return "Destino";
  if (d.label) return d.label;
  if (d.address) return d.address;
  if (d.latitude != null && d.longitude != null) {
    return `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`;
  }
  return "Destino";
}

/* ================================================================== *
 * Estado B — preparação
 * ================================================================== */

interface PreparacaoProps {
  viagem: Viagem;
  gpsOk: boolean;
  contato: string | null;
  onIniciar: () => void;
  onCancelar: () => void;
}

export function PreparacaoDeViagem({
  viagem,
  gpsOk,
  contato,
  onIniciar,
  onCancelar,
}: PreparacaoProps) {
  const itens: Array<[string, string, boolean]> = [
    ["GPS", gpsOk ? "Ativo" : "Sem sinal", gpsOk],
    ["Escudo Moto Anjo", "Ativo", true],
    ["Acompanhamento", contato ?? "Nenhum contato", contato != null],
  ];

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
            {rotuloDoDestino(viagem)}
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
  proximoEvento,
  vozLigada,
  vozSuportada,
  onAlternarVoz,
  onFinalizar,
}: CockpitProps) {
  return (
    <>
      {/* Cartão do próximo evento: um por vez, nunca uma pilha. */}
      {proximoEvento && (
        <div
          className={`absolute inset-x-3 top-[128px] ${camada(
            "cartoesDoMapa",
          )} flex items-center gap-3 rounded-2xl border px-3 py-2 backdrop-blur`}
          style={{
            borderColor: `${APARENCIA[proximoEvento.categoria].cor}66`,
            background: "rgba(0,0,0,0.78)",
          }}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{
              background: APARENCIA[proximoEvento.categoria].cor,
              transform: "rotate(45deg)",
            }}
          />
          <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-widest text-foreground">
            {APARENCIA[proximoEvento.categoria].rotulo}
          </span>
          <span className="text-xs font-bold text-gold">
            {distanciaCurta(proximoEvento.distanciaKm)}
          </span>
        </div>
      )}

      {/* Telemetria compacta: uma faixa, ~90 px, nunca um cartão vertical. */}
      <TelemetryStrip
        velocidade={velocidade}
        rumo={rumo}
        inclinacao={inclinacao}
        modo={modo}
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
