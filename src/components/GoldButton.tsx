import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

// Reference button: flat metallic gold block, black uppercase label, 8px radius.
export const GoldButton = forwardRef<HTMLButtonElement, Props>(
  ({ children, className, size = "md", ...rest }, ref) => {
    const sizeCls =
      size === "sm"
        ? "h-10 px-4 text-xs"
        : size === "lg"
          ? "h-13 px-8 text-sm"
          : "h-12 px-6 text-sm";
    return (
      <button
        ref={ref}
        {...rest}
        className={cn(
          "w-full rounded-lg bg-gold font-bold uppercase tracking-[0.12em] text-black transition-colors duration-200",
          "hover:bg-gold-light active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
          sizeCls,
          className,
        )}
      >
        <span className="flex items-center justify-center gap-2">{children}</span>
      </button>
    );
  },
);
GoldButton.displayName = "GoldButton";
