import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOS_HOLD_MS } from "@/lib/sos-client";

export type SosHoldVariant = "fab" | "map" | "compact" | "nav" | "page";

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
  fab: { box: "h-[58px] w-[58px]", icone: 20, rotulo: "text-[10px]", anel: "inset-[3px]" },
  map: { box: "h-[58px] w-[58px]", icone: 19, rotulo: "text-[10px]", anel: "inset-[3px]" },
  compact: { box: "h-11 w-11", icone: 16, rotulo: "text-[8px]", anel: "inset-[3px]" },
  nav: { box: "h-[112px] w-[112px]", icone: 30, rotulo: "text-[13px]", anel: "inset-[4px]" },
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
        "relative flex select-none flex-col items-center justify-center rounded-full",
        "border border-white/15 bg-[#111214]/95 text-white backdrop-blur-md",
        "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.95),0_0_0_1px_rgba(217,35,35,0.2)]",
        "transition-all duration-200 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emergency/25",
        holding &&
          "scale-95 border-emergency/70 bg-[#170d0d] shadow-[0_5px_22px_-5px_hsl(var(--emergency)/0.7),0_0_0_2px_hsl(var(--emergency)/0.2)]",
        variant === "compact" && "shadow-map",
        variant === "nav" && "border-2 border-emergency/70 bg-[#08090a] shadow-[0_0_0_5px_rgba(5,5,5,0.92),0_0_30px_rgba(217,35,35,0.28)]",
        size.box,
        disabled && "opacity-50",
        className,
      )}
      style={{ touchAction: "none" }}
    >
      <span
        aria-hidden
        className={cn("absolute rounded-full border border-emergency/45", size.anel)}
        style={{
          background: `conic-gradient(hsl(var(--emergency)) ${progress * 360}deg, rgba(255,255,255,0.06) 0)`,
          WebkitMask: "radial-gradient(circle, transparent 76%, black 77%)",
          mask: "radial-gradient(circle, transparent 76%, black 77%)",
        }}
      />
      <span className="relative z-10 flex flex-col items-center leading-none">
        {holding ? (
          <span
            className={cn(
              "font-black tabular-nums text-emergency",
              variant === "page" ? "text-4xl" : "text-xl",
            )}
          >
            {segundosRestantes}
          </span>
        ) : (
          <Siren size={size.icone} className="text-emergency drop-shadow-[0_0_6px_hsl(var(--emergency)/0.45)]" />
        )}
        <span className={cn("mt-1 font-black uppercase tracking-[0.16em]", size.rotulo)}>
          {variant === "page" ? "Emergência" : "SOS"}
        </span>
        <span
          className={cn(
            "mt-0.5 text-[6px] font-bold uppercase tracking-[0.1em] text-white/55",
            variant === "compact" && "sr-only",
            variant === "nav" && "text-[9px] tracking-[0.14em]",
          )}
        >
          {holding ? "Continue segurando" : "Segure 3s"}
        </span>
      </span>
    </button>
  );
}
