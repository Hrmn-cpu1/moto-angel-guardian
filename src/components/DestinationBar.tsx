import { ChevronRight, MapPin, ShieldCheck } from "lucide-react";
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
  onIniciar,
}: {
  viagem: Viagem;
  rota: RouteInfo | null;
  onAbrirDestino: () => void;
  onIniciar: () => void;
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
    <div className={`absolute inset-x-3 top-[64px] ${camada("cartoesDoMapa")}`}>
      <button
        type="button"
        onClick={onAbrirDestino}
        className="flex w-full items-center gap-3 rounded-2xl border border-gold/25 bg-black/80 px-3 py-2.5 text-left backdrop-blur-md"
      >
        <MapPin size={16} className="shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-foreground">
            {rotulo ? "Destino" : "Para onde vamos?"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {rotulo ?? "Toque para escolher o destino"}
          </span>
        </span>

        {rota ? (
          <span className="flex shrink-0 items-stretch gap-2 border-l border-white/10 pl-2 text-center">
            <span>
              <span className="block text-sm font-bold text-gold tabular-nums">
                {rota.distanciaKm.toFixed(1).replace(".", ",")} km
              </span>
              <span className="block text-[8px] uppercase tracking-widest text-muted-foreground">
                Distância
              </span>
            </span>
            <span>
              <span className="block text-sm font-bold text-foreground tabular-nums">
                {rota.duracaoMin} min
              </span>
              <span className="block text-[8px] uppercase tracking-widest text-muted-foreground">
                ETA
              </span>
            </span>
          </span>
        ) : (
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* A próxima manobra vive em <NextManeuver/>, logo abaixo desta faixa:
          duplicar a instrução aqui só roubava altura do mapa. */}
      {viagem.estado === "preparando" && (
        <button
          type="button"
          onClick={onIniciar}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl gold-gradient text-xs font-bold uppercase tracking-widest text-black"
        >
          <ShieldCheck size={14} /> Iniciar viagem segura
        </button>
      )}
    </div>
  );
}
