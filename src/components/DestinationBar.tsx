import { ChevronRight, Search } from "lucide-react";
import { camada } from "@/lib/layers";
import type { RouteInfo } from "@/components/RealMap";
import type { Viagem } from "@/lib/trip";

/**
 * Faixa compacta de destino, logo abaixo do cabeçalho.
 *
 * É o ponto de entrada da Viagem Segura na Home: sem destino ela convida,
 * com destino ela mostra distância e tempo REAIS vindos da rota do Google.
 * Nada é estimado aqui — sem rota calculada, os números simplesmente não
 * aparecem.
 */
export function DestinationBar({
  viagem,
  rota,
  onAbrirDestino,
}: {
  viagem: Viagem;
  rota: RouteInfo | null;
  onAbrirDestino: () => void;
}) {
  const destino = viagem.destino;
  const rotulo =
    destino?.label ??
    destino?.address ??
    rota?.destinoTexto ??
    (destino?.latitude != null && destino?.longitude != null
      ? `${destino.latitude.toFixed(4)}, ${destino.longitude.toFixed(4)}`
      : null);

  return (
    <div className={`absolute inset-x-4 top-[calc(var(--ma-top)+48px)] ${camada("cartoesDoMapa")}`}>
      <button
        type="button"
        onClick={onAbrirDestino}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/10 bg-map-panel/96 px-4 py-3 text-left shadow-map backdrop-blur-xl"
      >
        <Search size={18} className="shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-bold text-foreground">
            {rotulo ?? "Para onde vamos?"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {rotulo ? "Toque para alterar o destino" : "Escolha seu destino e prepare a viagem"}
          </span>
        </span>

        {rota ? (
          <span className="flex shrink-0 items-stretch gap-2 border-l border-foreground/10 pl-2 text-center">
            <span>
              <span className="block text-sm font-bold text-gold tabular-nums">
                {rota.distanciaKm.toFixed(1).replace(".", ",")} km
              </span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                Distância
              </span>
            </span>
            <span>
              <span className="block text-sm font-bold text-foreground tabular-nums">
                {rota.duracaoMin} min
              </span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                Tempo
              </span>
            </span>
          </span>
        ) : (
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* RC3.2: o "Iniciar viagem segura" morava AQUI e também no painel de
          preparação — dois botões idênticos na mesma tela, um deles debaixo do
          SOS flutuante. O CTA agora é único e vive no painel de preparação,
          junto da checagem de GPS e contato que a pessoa precisa ver antes de
          confirmar. A próxima manobra vive em <NextManeuver/>. */}
    </div>
  );
}
