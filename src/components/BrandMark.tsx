import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-2xl gold-gradient",
        "shadow-[0_10px_40px_-10px_oklch(0.78_0.13_84/0.6)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Shield size={size * 0.55} className="text-black" strokeWidth={2.4} />
      <div className="absolute inset-0 rounded-2xl border border-white/20" />
    </div>
  );
}
