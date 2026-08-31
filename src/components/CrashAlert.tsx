import { ShieldAlert } from "lucide-react";
import { camada } from "@/lib/layers";
import type { DeteccaoQueda } from "@/hooks/useCrashDetection";

/**
 * Pergunta "você está bem?" quando o motor fecha a assinatura de queda.
 *
 * Não decide nada: só mostra o countdown que já existe no hook e devolve as
 * duas respostas possíveis. Silêncio = SOS, pelo MESMO caminho do botão
 * manual.
 */
export function CrashAlert({ deteccao }: { deteccao: DeteccaoQueda }) {
  if (deteccao.estado !== "countdown") return null;
  return (
    <div
      role="alertdialog"
      aria-label="Possível queda detectada"
      className={`absolute inset-0 ${camada("painelInferior")} flex flex-col items-center justify-center gap-6 bg-background/95 px-6 backdrop-blur-sm`}
    >
      <ShieldAlert size={44} className="text-emergency" />
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emergency">
          Possível queda detectada
        </p>
        <p className="mt-2 text-4xl font-black tabular-nums text-foreground">
          {deteccao.segundos ?? 0}s
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sem resposta, o SOS será acionado automaticamente.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          onClick={deteccao.cancelar}
          className="ma-cta-h rounded-xl bg-map-panel/95 text-sm font-bold text-gold shadow-map"
        >
          Estou bem — cancelar
        </button>
        <button
          onClick={deteccao.confirmar}
          className="ma-cta-h rounded-xl bg-emergency text-sm font-black uppercase tracking-widest text-emergency-foreground"
        >
          Preciso de ajuda agora
        </button>
      </div>
    </div>
  );
}
