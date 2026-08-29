import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { camada } from "@/lib/layers";
import { normalizarDestino } from "@/lib/external-navigation";
import { useTecladoVirtual } from "@/hooks/useTecladoVirtual";
import { buscarLugares, type LugarEncontrado } from "@/lib/rota.functions";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * Entrada de destino da Viagem Segura.
 *
 * Aceita o que o motoboy tem na mão: endereço colado do app de entrega,
 * coordenada, link de mapa ou `geo:`. Tudo passa pelo mesmo normalizador que
 * já valida destino externo — entrada digitada é tão não confiável quanto
 * entrada de Intent.
 *
 * A busca de endereço acontece DENTRO do app (Places pelo servidor) e devolve
 * o destino já com coordenada: a rota não depende de geocodificação depois, e
 * o motociclista não é jogado para o Google Maps para escolher para onde vai.
 */
export function DestinoDialog({
  onEscolher,
  onFechar,
}: {
  onEscolher: (entrada: unknown) => void;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const valido = normalizarDestino(texto) != null;
  // Com o teclado aberto sobra pouca altura: o modal encolhe para o essencial
  // — campo e botão — em vez de empurrar o CTA para fora da tela.
  const teclado = useTecladoVirtual();

  const procurar = useServerFn(buscarLugares);
  const { position } = useGeolocation();
  const [lugares, setLugares] = useState<LugarEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);

  /* Sugestões: só para texto que parece endereço.
   *
   * Coordenada, link de mapa ou `geo:` já são destino resolvido — buscar
   * gastaria cota do Places para devolver o que a pessoa já digitou. */
  const consulta = texto.trim();
  const pareceEndereco =
    consulta.length >= 3 &&
    !/^[a-z][a-z0-9+.-]*:/i.test(consulta) &&
    !/^-?\d{1,3}[.,]\d+\s*[,;]\s*-?\d{1,3}[.,]\d+$/.test(consulta);

  useEffect(() => {
    if (!pareceEndereco) {
      setLugares([]);
      setBuscando(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    // Debounce: uma busca por pausa de digitação, não por tecla.
    const t = window.setTimeout(() => {
      procurar({
        data: {
          consulta,
          ...(position ? { lat: position.lat, lng: position.lng } : {}),
        },
      })
        .then((r) => {
          if (!vivo) return;
          setLugares(r.lugares);
        })
        .catch(() => {
          if (vivo) setLugares([]);
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
    }, 450);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [consulta, pareceEndereco, procurar, position?.lat, position?.lng]);

  return (
    <div
      className={`fixed inset-0 ${camada("fundoModal")} flex items-end bg-black/80 p-3`}
      role="dialog"
      aria-label="Escolher destino"
      // A folha acompanha o teclado: o navegador encolhe a viewport visual, e
      // é essa altura que vale, não a da janela.
      style={{ height: "100dvh", maxHeight: "100dvh" }}
    >
      <div className="ma-sheet ma-sheet-compact rounded-3xl border border-gold/30 bg-background">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              Viagem segura
            </p>
            <h2 className="mt-0.5 text-sm font-bold text-foreground">Para onde você vai?</h2>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-full border border-white/10 p-2 text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <div className="relative mt-2.5">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="text"
            autoFocus
            enterKeyHint="go"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter com sugestão pronta usa a PRIMEIRA — ela tem coordenada.
              if (lugares[0]) onEscolher(destinoDoLugar(lugares[0]));
              else if (valido) onEscolher(texto);
            }}
            placeholder="Endereço, link do mapa ou -23.55, -46.63"
            className="ma-input w-full rounded-2xl border border-white/10 bg-black/50 px-3 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/50"
          />
          {/* Limpar sem apagar letra por letra com luva. */}
          {texto.length > 0 && (
            <button
              type="button"
              onClick={() => setTexto("")}
              aria-label="Limpar destino"
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {pareceEndereco && (
          <div
            data-testid="sugestoes-destino"
            className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-white/10 bg-black/40"
          >
            {buscando && lugares.length === 0 && (
              <p className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-muted-foreground">
                <Loader2 size={13} className="animate-spin text-gold" /> Procurando endereços...
              </p>
            )}
            {!buscando && lugares.length === 0 && (
              <p className="px-3 py-2.5 text-[11px] text-muted-foreground">
                Nenhum endereço encontrado. Você ainda pode usar o texto digitado.
              </p>
            )}
            {lugares.map((lugar) => (
              <button
                key={lugar.id}
                type="button"
                onClick={() => onEscolher(destinoDoLugar(lugar))}
                className="flex w-full items-start gap-2 border-b border-white/5 px-3 py-3 text-left last:border-b-0 active:bg-white/5"
              >
                <Search size={13} className="mt-0.5 shrink-0 text-gold" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {lugar.nome}
                  </span>
                  {lugar.endereco && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {lugar.endereco}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {!teclado && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Você também pode compartilhar o endereço de outro aplicativo para o Moto Anjo.
          </p>
        )}

        <button
          disabled={!valido}
          onClick={() => onEscolher(texto)}
          className="mt-2.5 flex ma-cta-h w-full items-center justify-center gap-2 rounded-2xl gold-gradient text-sm font-bold text-black disabled:opacity-40"
        >
          <MapPin size={16} /> Usar este destino
        </button>
      </div>
    </div>
  );
}

/** Lugar do Places -> destino com coordenada, no formato que o app já valida. */
export function destinoDoLugar(lugar: LugarEncontrado) {
  return {
    latitude: lugar.lat,
    longitude: lugar.lng,
    address: lugar.endereco ?? lugar.nome,
    label: lugar.nome,
    source: "busca" as const,
  };
}
