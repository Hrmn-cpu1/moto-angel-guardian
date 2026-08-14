import { X } from "lucide-react";
import { camada } from "@/lib/layers";

export interface CamadaItem {
  chave: string;
  rotulo: string;
  ativa: boolean;
  alternar: () => void;
}

/**
 * Bottom sheet de camadas. Só entram categorias que existem de verdade no
 * projeto — camada sem fonte de dado é promessa vazia no mapa.
 */
export function MapLayersSheet({ itens, onFechar }: { itens: CamadaItem[]; onFechar: () => void }) {
  return (
    <div
      className={`fixed inset-0 ${camada("fundoModal")} flex items-end bg-black/70 p-3`}
      role="dialog"
      aria-label="Camadas do mapa"
      onClick={onFechar}
    >
      <div
        className="ma-sheet rounded-3xl border border-gold/30 bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
            Camadas do mapa
          </p>
          <button
            onClick={onFechar}
            aria-label="Fechar camadas"
            className="rounded-full border border-white/10 p-2 text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {itens.map((i) => (
            <li key={i.chave}>
              <button
                type="button"
                role="switch"
                aria-checked={i.ativa}
                onClick={i.alternar}
                className={`flex ma-control-h w-full items-center justify-between rounded-2xl border px-3 text-[13px] ${
                  i.ativa
                    ? "border-gold/45 bg-gold/10 text-foreground"
                    : "border-white/10 bg-black/40 text-muted-foreground"
                }`}
              >
                {i.rotulo}
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-black ${
                    i.ativa ? "border-gold bg-gold text-black" : "border-white/20"
                  }`}
                >
                  {i.ativa ? "✓" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
