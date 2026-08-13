import { Navigation, ShieldCheck, Gauge, MapPin, X, Volume2, VolumeX } from "lucide-react";
import { camada } from "@/lib/layers";
import { distanciaCurta, APARENCIA, type EventoNoMapa } from "@/lib/map-events";
import type { Cardeal, Inclinacao } from "@/lib/ride-telemetry";
import type { Viagem } from "@/lib/trip";

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
      className={`absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+150px)] ${camada(
        "painelInferior",
      )} rounded-3xl border border-gold/30 bg-black/85 p-4 backdrop-blur`}
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
            <span className={ok ? "font-semibold text-gold" : "text-muted-foreground"}>{valor}</span>
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
        className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl gold-gradient text-sm font-bold text-black"
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
  viagem,
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
  const grausInclinacao = inclinacao.graus ?? 0;
  const temInclinacao = inclinacao.graus != null;
  // -45..45 vira 0..100 na régua.
  const posicaoNaRegua = ((grausInclinacao + 45) / 90) * 100;

  return (
    <>
      {/* Cartão do próximo evento: um por vez, nunca uma pilha. */}
      {proximoEvento && (
        <div
          className={`absolute inset-x-3 top-[76px] ${camada(
            "cartoesDoMapa",
          )} flex items-center gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur`}
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
          <span className="flex-1 truncate text-xs font-bold uppercase tracking-widest text-foreground">
            {APARENCIA[proximoEvento.categoria].rotulo}
          </span>
          <span className="text-sm font-bold text-gold">
            {distanciaCurta(proximoEvento.distanciaKm)}
          </span>
        </div>
      )}

      <div
        className={`absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+150px)] ${camada(
          "painelInferior",
        )} rounded-3xl border border-gold/30 bg-black/85 p-4 backdrop-blur`}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
            <ShieldCheck size={12} /> Protegido
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {modo === "pilotando" ? "Em movimento" : "Parado"}
            </span>
            {/* O botão só existe se o aparelho realmente tiver voz. Sem TTS,
                não oferecemos algo que não vai acontecer. */}
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
          </div>
        </div>

        {/* Velocidade: o número que se lê de relance. */}
        <div className="mt-2 flex items-end justify-center gap-2">
          <span className="text-[56px] font-bold leading-none tracking-tight text-foreground tabular-nums">
            {velocidade ?? "—"}
          </span>
          <span className="pb-2 text-xs uppercase tracking-widest text-muted-foreground">km/h</span>
        </div>

        {/* Régua de inclinação. O rótulo diz de onde vem o dado. */}
        <div className="mt-3">
          <div className="relative h-1.5 rounded-full bg-white/10">
            <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
            {temInclinacao && (
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold transition-all duration-200"
                style={{ left: `${posicaoNaRegua}%` }}
              />
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Esq</span>
            <span className={inclinacao.confianca === "boa" ? "text-gold" : ""}>
              {temInclinacao ? `${grausInclinacao}°` : "—"}
              {inclinacao.confianca === "baixa" && " (aparelho)"}
            </span>
            <span>Dir</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2.5 py-2">
            <Navigation size={12} className="shrink-0 text-gold" />
            <span className="text-muted-foreground">Rumo</span>
            <span className="ml-auto font-bold text-foreground">{rumo ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2.5 py-2">
            <MapPin size={12} className="shrink-0 text-gold" />
            <span className="truncate text-muted-foreground">{rotuloDoDestino(viagem)}</span>
          </div>
        </div>

        <button
          onClick={onFinalizar}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/15 text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          Finalizar viagem
        </button>
      </div>
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
      className={`absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+150px)] ${camada(
        "painelInferior",
      )} flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-black/80 text-sm font-bold uppercase tracking-widest text-gold backdrop-blur`}
    >
      <Gauge size={16} /> Iniciar viagem segura
    </button>
  );
}
