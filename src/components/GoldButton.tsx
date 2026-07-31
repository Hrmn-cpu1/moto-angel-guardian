import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export const GoldButton = forwardRef<HTMLButtonElement, Props>(
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
          "gold-gradient relative w-full overflow-hidden rounded-xl font-semibold uppercase tracking-[0.14em] text-black transition-all duration-300",
          "shadow-[0_8px_32px_-8px_oklch(0.83_0.169_85/0.4)] hover:shadow-[0_12px_40px_-8px_oklch(0.83_0.169_85/0.6)]",
          "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
          "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
          sizeCls,
          className,
        )}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
      </button>
    );
  },
);
GoldButton.displayName = "GoldButton";
