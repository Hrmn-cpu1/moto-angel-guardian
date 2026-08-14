import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOS_HOLD_MS } from "@/lib/sos-client";

export type SosHoldVariant = "fab" | "map" | "page";

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
  fab: { box: "h-[72px] w-[72px]", icone: 22, rotulo: "text-[12px]", anel: "inset-[4px]" },
  map: { box: "h-[68px] w-[68px]", icone: 20, rotulo: "text-[11px]", anel: "inset-[3px]" },
  page: { box: "h-[min(56vw,208px)] w-[min(56vw,208px)]", icone: 38, rotulo: "text-base", anel: "inset-2" },
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
        "relative flex select-none flex-col items-center justify-center rounded-full text-white",
        "border-2 border-emergency/60 transition-transform active:scale-95",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emergency/50",
        "animate-pulse-emergency",
        size.box,
        disabled && "opacity-50",
        className,
      )}
      style={{
        touchAction: "none",
        background:
          "radial-gradient(circle at 50% 35%, oklch(0.70 0.22 27.5), oklch(0.40 0.19 27.5))",
      }}
    >
      <span
        aria-hidden
        className={cn("absolute rounded-full", size.anel)}
        style={{
          background: `conic-gradient(rgba(255,255,255,0.9) ${progress * 360}deg, transparent 0)`,
          WebkitMask: "radial-gradient(circle, transparent 70%, black 71%)",
          mask: "radial-gradient(circle, transparent 70%, black 71%)",
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
        <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.2em] opacity-85">
          {holding ? "Continue segurando" : "Segure 3s"}
        </span>
      </span>
    </button>
  );
}
