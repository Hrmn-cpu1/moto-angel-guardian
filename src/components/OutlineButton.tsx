import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export const OutlineButton = forwardRef<HTMLButtonElement, Props>(
  ({ children, className, size = "md", ...rest }, ref) => {
    const sizeCls =
      size === "sm"
        ? "h-10 px-4 text-sm"
        : size === "lg"
          ? "h-14 px-8 text-base"
          : "h-12 px-6 text-sm";
    return (
      <button
        ref={ref}
        {...rest}
        className={cn(
          "w-full rounded-xl border border-gold/40 bg-transparent font-semibold uppercase tracking-[0.14em] text-gold transition-all duration-300",
          "hover:border-gold hover:bg-gold/5 hover:shadow-[0_8px_24px_-8px_oklch(0.83_0.169_85/0.3)]",
          "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
          sizeCls,
          className,
        )}
      >
        <span className="flex items-center justify-center gap-2">{children}</span>
      </button>
    );
  },
);
OutlineButton.displayName = "OutlineButton";
