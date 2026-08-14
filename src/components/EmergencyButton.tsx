/**
 * OBSOLETO desde o Checkpoint 1.
 *
 * A tela /sos passou a usar `SosHoldButton`, que compartilha a mesma regra de
 * pressão prolongada com o botão do painel e o botão do mapa. Este arquivo
 * ficou sem uso e é mantido apenas como referência visual — não ligue nada
 * novo nele, ou o gesto de emergência volta a ter duas implementações.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onActivate: () => void;
  disabled?: boolean;
}

export function EmergencyButton({ onActivate, disabled }: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    if (disabled) return;
    setHolding(true);
    startRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - startRef.current) / 3000);
      setProgress(p);
      if (p >= 1) {
        stop();
        onActivate();
      }
    }, 50);
  }, [disabled, onActivate, stop]);

  const countdown = Math.max(1, 3 - Math.floor(progress * 3));

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        disabled={disabled}
        className={cn(
          "relative flex h-64 w-64 items-center justify-center rounded-full transition-transform",
          "animate-pulse-emergency active:scale-95",
          disabled && "opacity-50",
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 35%, oklch(0.66 0.21 27.5), oklch(0.42 0.19 27.5))",
          boxShadow: "0 0 60px oklch(0.586 0.213 27.5 / 0.55)",
        }}
        aria-label="Botão de emergência"
      >
        <span
          className="absolute inset-2 rounded-full"
          style={{
            background: `conic-gradient(rgba(255,255,255,0.7) ${progress * 360}deg, transparent 0)`,
            WebkitMask: "radial-gradient(circle, transparent 62%, black 63%)",
            mask: "radial-gradient(circle, transparent 62%, black 63%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-2 text-white">
          {holding ? (
            <span className="text-6xl font-black tabular-nums leading-none">{countdown}</span>
          ) : (
            <Siren size={44} strokeWidth={2} />
          )}
          <span className="text-xl font-black uppercase tracking-wide leading-none">
            Emergência
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-85">
            {holding ? "Segure" : "Toque e segure"}
          </span>
        </div>
      </button>
      <p className="max-w-[15rem] text-center text-xs text-muted-foreground">
        Alerta será enviado para motoboys próximos e contatos de confiança.
      </p>
    </div>
  );
}
