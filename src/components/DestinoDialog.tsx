import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { camada } from "@/lib/layers";
import { normalizarDestino } from "@/lib/external-navigation";

/**
 * Entrada de destino da Viagem Segura.
 *
 * Aceita o que o motoboy tem na mão: endereço colado do app de entrega,
 * coordenada, link de mapa ou `geo:`. Tudo passa pelo mesmo normalizador que
 * já valida destino externo — entrada digitada é tão não confiável quanto
 * entrada de Intent.
 */
export function DestinoDialog({
  onEscolher,
  onFechar,
}: {
  onEscolher: (entrada: string) => void;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const valido = normalizarDestino(texto) != null;

  return (
    <div
      className={`fixed inset-0 ${camada("fundoModal")} flex items-end bg-black/80 p-3`}
      role="dialog"
      aria-label="Escolher destino"
    >
      <div className="w-full rounded-3xl border border-gold/30 bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              Viagem segura
            </p>
            <h2 className="mt-1 text-base font-bold text-foreground">Para onde você vai?</h2>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-full border border-white/10 p-2 text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="text"
          autoFocus
          placeholder="Endereço, link do mapa ou -23.55, -46.63"
          className="mt-3 min-h-[48px] w-full rounded-2xl border border-white/10 bg-black/50 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/50"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Você também pode compartilhar o endereço de outro aplicativo para o Moto Anjo.
        </p>

        <button
          disabled={!valido}
          onClick={() => onEscolher(texto)}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl gold-gradient text-sm font-bold text-black disabled:opacity-40"
        >
          <MapPin size={16} /> Usar este destino
        </button>
      </div>
    </div>
  );
}
