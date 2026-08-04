interface SpeedometerProps {
  speed: number;
  max?: number;
}

/** Premium gold arc speedometer with a live digital readout. */
export function Speedometer({ speed, max = 180 }: SpeedometerProps) {
  const pct = Math.min(1, Math.max(0, speed / max));
  const radius = 88;
  const circumference = Math.PI * radius; // half circle
  const dash = circumference * pct;

  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 116" className="w-full">
        <path
          d="M 12 104 A 88 88 0 0 1 188 104"
          fill="none"
          stroke="currentColor"
          className="text-gold/15"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 12 104 A 88 88 0 0 1 188 104"
          fill="none"
          stroke="currentColor"
          className="text-gold transition-[stroke-dasharray] duration-500 ease-out"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-black leading-none text-foreground [font-size:clamp(2.75rem,14vw,3.5rem)]">
          {speed}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-gold">km/h</p>
      </div>
    </div>
  );
}
