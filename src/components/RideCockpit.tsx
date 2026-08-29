import { ShieldCheck, Gauge, X, Loader2, AlertTriangle, Flag } from "lucide-react";
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
  const checagens: Array<[string, string, boolean]> = [
    ["GPS", gpsOk ? "Ativo" : "Sem sinal", gpsOk],
    ["Escudo", "Ativo", true],
    ["Contato", contato ?? "Nenhum", contato != null],
  ];
  if (segundoPlano) checagens.push(["2º plano", segundoPlano.rotulo, segundoPlano.ok]);

  return (
    <div
      data-testid="previa-da-rota"
      className={`absolute inset-x-3 bottom-[calc(var(--ma-bottom)+86px)] ${camada(
        "painelInferior",
      )} rounded-3xl border border-gold/30 bg-[#0A0A0A]/95 ma-card-pad shadow-[0_-10px_40px_rgba(0,0,0,0.65)] backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
            Sua rota
          </p>
          <p className="mt-1 truncate text-base font-bold leading-tight text-foreground">
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

      {/* Números reais da rota. Sem rota calculada, nada é exibido — no lugar
          entra o estado honesto (calculando / indisponível). */}
      {rota ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[30px] font-black leading-none text-gold tabular-nums">
              {rota.duracaoMin}
              <span className="ml-1 text-[12px] font-bold uppercase text-muted-foreground">
                min
              </span>
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Chegada estimada
            </p>
          </div>
          <div>
            <p className="text-[30px] font-black leading-none text-foreground tabular-nums">
              {rota.distanciaKm.toFixed(1).replace(".", ",")}
              <span className="ml-1 text-[12px] font-bold uppercase text-muted-foreground">km</span>
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Distância
            </p>
          </div>
        </div>
      ) : (
        <p
          data-testid="estado-da-rota"
          className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"
        >
          {estadoDaRota === "calculando" ? (
            <>
              <Loader2 size={13} className="animate-spin text-gold" /> Calculando a melhor rota...
            </>
          ) : estadoDaRota === "indisponivel" ? (
            <>
              <AlertTriangle size={13} className="text-emergency" /> Rota indisponível agora. O
              destino continua salvo e a viagem pode começar mesmo assim.
            </>
          ) : (
            <>
              <Flag size={13} className="text-gold" /> Destino definido. Aguardando o cálculo da
              rota.
            </>
          )}
        </p>
      )}

      {/* Checagens: uma linha de chips, não uma lista burocrática. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {checagens.map(([rotulo, valor, ok]) => (
          <li
            key={rotulo}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              ok
                ? "border-gold/35 bg-gold/10 text-gold"
                : "border-white/12 bg-white/5 text-muted-foreground"
            }`}
          >
            {rotulo} · {valor}
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
