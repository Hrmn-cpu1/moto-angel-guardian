interface LeanGaugeProps {
  /** lean angle in degrees: negative = left, positive = right */
  lean: number;
  /** pitch angle in degrees */
  pitch: number;
}

/** Motorcycle tilt indicator driven by the device gyroscope. */
export function LeanGauge({ lean, pitch }: LeanGaugeProps) {
  return (
    <div className="mt-4">
      <div className="relative mx-auto h-28 w-full max-w-[260px] overflow-hidden rounded-xl border border-gold/20 bg-black/50">
        <div
          className="absolute inset-0 flex items-center justify-center transition-transform duration-200 ease-out"
          style={{ transform: `rotate(${-lean}deg) translateY(${pitch / 6}px)` }}
        >
          <div className="h-px w-[140%] bg-gold/70" />
        </div>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/60" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-gold/15 bg-black/40 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Inclinação
          </p>
          <p className="mt-1 text-sm font-bold text-gold">
            {Math.abs(lean)}° {lean === 0 ? "" : lean < 0 ? "esq." : "dir."}
          </p>
        </div>
        <div className="rounded-lg border border-gold/15 bg-black/40 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Pitch
          </p>
          <p className="mt-1 text-sm font-bold text-gold">{pitch}°</p>
        </div>
      </div>
    </div>
  );
}