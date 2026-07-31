import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: boolean;
}

// Reference card: graphite panel, thin gold hairline, 12px radius.
export function PremiumCard({ children, className, glow = false, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn(
        "glass-card animate-fade-up rounded-xl p-4",
        glow && "border-gold/60",
        className,
      )}
    >
      {children}
    </div>
  );
}
