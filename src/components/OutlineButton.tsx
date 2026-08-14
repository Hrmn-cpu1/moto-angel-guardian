import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

// Reference secondary button: 1px gold outline on graphite, gold uppercase label.
export const OutlineButton = forwardRef<HTMLButtonElement, Props>(
  ({ children, className, size = "md", ...rest }, ref) => {
    const sizeCls =
      size === "sm"
        ? "h-9 px-3.5 text-[11px]"
        : size === "lg"
          ? "h-[50px] px-4 text-sm"
          : "h-[46px] px-5 text-[13px]";
    return (
      <button
        ref={ref}
        {...rest}
        className={cn(
          "w-full rounded-lg border border-gold bg-transparent font-bold uppercase tracking-[0.12em] text-gold transition-colors duration-200",
          "hover:bg-gold/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
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
