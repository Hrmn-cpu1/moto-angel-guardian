import { Star } from "lucide-react";

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
}

/** Slim translucent status strip floating over the full-screen home map. */
export function HomeTopBar({
  gpsOnline,
  sharing: _sharing = false,
  copilotOnline: _copilotOnline = false,
  tripActive: _tripActive = false,
  segundoPlano: _segundoPlano = null,
  temServico: _temServico = false,
}: Props) {
  return (
    <header className="pointer-events-none absolute inset-x-4 top-[var(--ma-top)] z-30 grid h-9 grid-cols-[minmax(0,1fr)_auto] items-center">
      <div className="flex min-w-0 items-center gap-2">
        <Star size={17} className="shrink-0 fill-gold text-gold" aria-hidden="true" />
        <span className="truncate font-display text-[15px] font-extrabold text-foreground">
          Moto Anjo
        </span>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold text-foreground">
        GPS
        <span
          className={`h-2 w-2 rounded-full ${gpsOnline ? "bg-success" : "bg-muted-foreground"}`}
          aria-label={gpsOnline ? "GPS ativo" : "GPS aguardando sinal"}
        />
      </span>
    </header>
  );
}
