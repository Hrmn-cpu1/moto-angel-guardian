import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: boolean;
}

export function PremiumCard({ children, className, glow = false, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn(
        "glass-card animate-fade-up rounded-2xl p-5",
        glow && "shadow-[0_0_60px_-20px_oklch(0.78_0.13_84/0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
