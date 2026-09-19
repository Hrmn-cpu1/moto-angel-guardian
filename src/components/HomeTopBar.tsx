import { Star } from "lucide-react";
import { DaisyVoiceButton } from "@/components/DaisyVoiceButton";
import type { DaisyCommand } from "@/lib/daisy";

interface Props {
  gpsOnline: boolean;
  sharing?: boolean;
  /** Copiloto avaliando eventos reais neste momento. */
  copilotOnline?: boolean;
  /** Viagem Segura em curso. */
  tripActive?: boolean;
  /**
   * Proteção em segundo plano: um ponto, não um painel.
   *
   * `null` fora do Android — nada a prometer onde o serviço não existe.
   * A descrição vai no title/aria-label porque quem está pilotando não tem
   * espaço para ler um parágrafo aqui; a explicação por extenso mora no
   * painel de preparação, onde ainda dá para resolver.
   */
  segundoPlano?: { ok: boolean; descricao: string } | null;
  /** O aparelho tem o serviço nativo (Android). Fora dele nada é prometido. */
  temServico?: boolean;
  onDaisyCommand?: (command: DaisyCommand, transcript: string) => void;
}

/** Slim translucent status strip floating over the full-screen home map. */
export function HomeTopBar({
  gpsOnline,
  sharing: _sharing = false,
  copilotOnline: _copilotOnline = false,
  tripActive = false,
  segundoPlano = null,
  temServico: _temServico = false,
  onDaisyCommand,
}: Props) {
  // Fora da viagem não há serviço em segundo plano a reportar. Durante a
  // viagem o estado real segue acessível sem voltar a criar uma faixa visual.
  const estadoSegundoPlano = tripActive && segundoPlano ? segundoPlano : null;

  return (
    <>
      <header className="pointer-events-none absolute inset-x-4 top-[var(--ma-top)] z-30 grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center rounded-2xl border border-white/10 bg-map-panel/92 px-3 shadow-map backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold/15">
            <Star size={15} className="fill-gold text-gold" aria-hidden="true" />
          </span>
          <span className="truncate font-display text-[15px] font-extrabold text-foreground">
            Moto Anjo
          </span>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-bold text-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              gpsOnline ? "bg-success shadow-[0_0_10px_rgba(34,197,94,0.8)]" : "bg-muted-foreground"
            }`}
            aria-label={gpsOnline ? "GPS ativo" : "GPS aguardando sinal"}
          />
          {gpsOnline ? "GPS ativo" : "Buscando GPS"}
        </span>
        {estadoSegundoPlano && (
          <span className="sr-only">Proteção em segundo plano: {estadoSegundoPlano.descricao}</span>
        )}
      </header>

      {onDaisyCommand && (
        <div className="pointer-events-auto absolute right-3 top-[calc(var(--ma-top)+124px)] z-30">
          <DaisyVoiceButton onCommand={onDaisyCommand} variant="floating" />
        </div>
      )}
    </>
  );
}
