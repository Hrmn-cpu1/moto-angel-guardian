import { useEffect, useState } from "react";
import { Clipboard, Trash2, X } from "lucide-react";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import {
  limparDiagnosticoLock,
  lerDiagnosticoLock,
  type EventoDiagnosticoLock,
} from "@/lib/trip-service";
import { toast } from "sonner";

function tempoRelativo(quandoMs: number): string {
  const segundos = Math.max(0, Math.floor((Date.now() - quandoMs) / 1000));
  if (segundos < 2) return "agora";
  if (segundos < 60) return `há ${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos}min`;
  const horas = Math.floor(minutos / 60);
  return `há ${horas}h`;
}

function textoParaCopiar(eventos: EventoDiagnosticoLock[]): string {
  const agora = Date.now();
  return eventos
    .map((item) => {
      const segundos = Math.max(0, Math.floor((agora - item.quandoMs) / 1000));
      return `-${segundos}s ${item.evento}`;
    })
    .join("\n");
}

export function AndroidLockDiagnostics({ onClose }: { onClose: () => void }) {
  const [eventos, setEventos] = useState<EventoDiagnosticoLock[]>([]);

  useEffect(() => {
    void lerDiagnosticoLock().then((resultado) => setEventos(resultado.eventos));
  }, []);

  const limpar = async () => {
    await limparDiagnosticoLock();
    setEventos([]);
    toast("Diagnóstico limpo.");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoParaCopiar(eventos));
      toast("Diagnóstico copiado.");
    } catch {
      toast.error("Não foi possível copiar o diagnóstico.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-background/90 sm:items-center sm:justify-center">
      <section className="flex max-h-[88dvh] w-full max-w-md flex-col border-t border-gold/30 bg-background sm:border">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Diagnóstico Android</h2>
            <p className="text-xs text-muted-foreground">Últimos {eventos.length} de 50 eventos</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar diagnóstico"
            className="flex h-10 w-10 items-center justify-center text-muted-foreground"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {eventos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum evento registrado.
            </p>
          ) : (
            <ol className="space-y-2 font-mono text-xs">
              {[...eventos].reverse().map((item, indice) => (
                <li
                  key={`${item.quandoMs}-${indice}`}
                  className="flex gap-3 border-b border-border py-2"
                >
                  <time className="w-16 shrink-0 text-muted-foreground">
                    {tempoRelativo(item.quandoMs)}
                  </time>
                  <span className="break-all text-foreground">{item.evento}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <OutlineButton onClick={limpar} disabled={eventos.length === 0}>
            <Trash2 size={14} /> Limpar diagnóstico
          </OutlineButton>
          <GoldButton onClick={copiar} disabled={eventos.length === 0}>
            <Clipboard size={14} /> Copiar diagnóstico
          </GoldButton>
        </footer>
      </section>
    </div>
  );
}
