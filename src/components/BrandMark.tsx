import { cn } from "@/lib/utils";
import logo from "@/assets/moto-anjo-logo.png";

// Official emblem from the brand reference: winged rider with halo, in gold.
export function BrandMark({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt="Moto Anjo"
      width={1024}
      height={768}
      className={cn("block h-auto object-contain", className)}
      style={{ width: size * 1.6 }}
    />
  );
}
