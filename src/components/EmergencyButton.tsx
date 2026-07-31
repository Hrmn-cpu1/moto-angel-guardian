import { useCallback, useEffect, useRef, useState } from "react";
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
    <div className="flex flex-col items-center gap-6">
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
          background: "radial-gradient(circle at 30% 30%, oklch(0.7 0.24 26), oklch(0.45 0.24 26))",
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
        <div className="relative z-10 flex flex-col items-center gap-1 text-white">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">
            {holding ? "Segure" : "Pressione"}
          </span>
          <span className="text-6xl font-black tabular-nums leading-none">
            {holding ? countdown : "SOS"}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.28em] opacity-80">
            Emergência
          </span>
        </div>
      </button>
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Pressione e segure por 3 segundos para ativar o alerta de demonstração.
      </p>
    </div>
  );
}
