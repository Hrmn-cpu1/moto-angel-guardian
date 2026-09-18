import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOS_HOLD_MS } from "@/lib/sos-client";

export type SosHoldVariant = "fab" | "map" | "compact" | "page";

interface Props {
  /** Recebe quantos milissegundos a pressão realmente durou. */
  onHoldComplete: (heldMs: number) => void;
  disabled?: boolean;
  variant?: SosHoldVariant;
  className?: string;
  /** Sobrescreve o tempo apenas em testes; a produção usa SOS_HOLD_MS. */
  holdMs?: number;
}

const TAMANHOS: Record<
  SosHoldVariant,
  { box: string; icone: number; rotulo: string; anel: string }
> = {
  fab: { box: "h-[64px] w-[64px]", icone: 21, rotulo: "text-[11px]", anel: "inset-[3px]" },
  map: { box: "h-[64px] w-[64px]", icone: 20, rotulo: "text-[11px]", anel: "inset-[3px]" },
  compact: { box: "h-12 w-12", icone: 17, rotulo: "text-[9px]", anel: "inset-[3px]" },
  page: {
    box: "h-[min(56vw,208px)] w-[min(56vw,208px)]",
    icone: 38,
    rotulo: "text-base",
    anel: "inset-2",
  },
};

/**
 * Gesto de emergência compartilhado.
 *
 * Um SOS não pode disparar por esbarrão no bolso, então exige três segundos de
 * pressão contínua. O anel mostra o progresso e a contagem regressiva diz
 * quanto falta, para que a pessoa saiba que precisa continuar segurando.
 *
 * O componente só mede o gesto. Quem decide se o acionamento vale é o
 * `useSosController`, que recebe `heldMs` e reavalia a regra.
 */
export function SosHoldButton({
  onHoldComplete,
  disabled,
  variant = "fab",
  className,
  holdMs = SOS_HOLD_MS,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const firedRef = useRef(false);
  const size = TAMANHOS[variant];

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      // Mantém o gesto vivo mesmo se o dedo escorregar alguns pixels.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      firedRef.current = false;
      setHolding(true);
      startRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        const decorrido = Date.now() - startRef.current;
        const p = Math.min(1, decorrido / holdMs);
        setProgress(p);
        if (p >= 1 && !firedRef.current) {
          firedRef.current = true;
          stop();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.([80, 40, 80]);
          }
          onHoldComplete(decorrido);
        }
      }, 50);
    },
    [disabled, holdMs, onHoldComplete, stop],
  );

  const segundosRestantes = Math.max(1, Math.ceil((holdMs / 1000) * (1 - progress)));

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label="Acionar SOS de emergência — segure 3 segundos"
      className={cn(
        "relative flex select-none flex-col items-center justify-center rounded-full text-destructive-foreground",
        "border border-emergency/80 bg-emergency transition-all duration-200 active:scale-95",
        "shadow-[0_8px_28px_-8px_hsl(var(--emergency)/0.9)]",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emergency/30",
        holding && "scale-95 shadow-[0_4px_18px_-5px_hsl(var(--emergency)/0.95)]",
        variant === "compact" && "shadow-map",
        size.box,
        disabled && "opacity-50",
        className,
      )}
      style={{ touchAction: "none" }}
    >
      <span
        aria-hidden
        className={cn("absolute rounded-full border border-white/20", size.anel)}
        style={{
          background: `conic-gradient(rgba(255,255,255,0.95) ${progress * 360}deg, rgba(0,0,0,0.18) 0)`,
          WebkitMask: "radial-gradient(circle, transparent 76%, black 77%)",
          mask: "radial-gradient(circle, transparent 76%, black 77%)",
        }}
      />
      <span className="relative z-10 flex flex-col items-center leading-none">
        {holding ? (
          <span
            className={cn("font-black tabular-nums", variant === "page" ? "text-4xl" : "text-xl")}
          >
            {segundosRestantes}
          </span>
        ) : (
          <Siren size={size.icone} />
        )}
        <span className={cn("mt-1 font-black uppercase tracking-wider", size.rotulo)}>
          {variant === "page" ? "Emergência" : "SOS"}
        </span>
        <span
          className={cn(
            "mt-0.5 text-[6px] font-bold uppercase tracking-[0.12em] opacity-90",
            variant === "compact" && "sr-only",
          )}
        >
          {holding ? "Continue segurando" : "Segure 3s"}
        </span>
      </span>
    </button>
  );
}
