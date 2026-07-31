import { cn } from "@/lib/utils";
import logo from "@/assets/moto-anjo-emblem.png";

// Official emblem from the brand reference: winged rider with gold halo and wings.
export function BrandMark({
  size = 64,
  className,
  withWordmark = false,
}: {
  size?: number;
  className?: string;
  withWordmark?: boolean;
}) {
  const img = (
    <img
      src={logo}
      alt="Moto Anjo"
      width={1024}
      height={1024}
      className={cn("block h-auto object-contain drop-shadow-[0_0_28px_rgba(212,175,55,0.35)]", !withWordmark && className)}
      style={{ width: size * 1.6 }}
    />
  );
  if (!withWordmark) return img;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      {img}
      <span
        className="font-black lowercase italic leading-none tracking-[0.02em] text-foreground"
        style={{ fontSize: size * 0.46 }}
      >
        moto-<span className="gold-text">anjo</span>
      </span>
      <span
        className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground"
        style={{ fontSize: Math.max(8, size * 0.1) }}
      >
        Um por todos. <span className="gold-text">Todos por um.</span>
      </span>
    </div>
  );
}
