import { cn } from "@/lib/utils";
import logo from "@/assets/moto-anjo-logo.png";

// Official emblem from the brand reference: winged rider with halo, in gold.
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
      height={768}
      className={cn("block h-auto object-contain", !withWordmark && className)}
      style={{ width: size * 1.6 }}
    />
  );
  if (!withWordmark) return img;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      {img}
      <span
        className="text-primary font-black uppercase italic leading-none tracking-[0.06em]"
        style={{ fontSize: size * 0.42 }}
      >
        Moto-Anjo
      </span>
    </div>
  );
}
