import { cn } from "@/lib/utils";

interface Props {
  status: "active" | "warning" | "danger" | "idle";
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: Props) {
  const dot =
    status === "active"
      ? "bg-success shadow-[0_0_8px_oklch(0.72_0.18_150/0.8)]"
      : status === "warning"
        ? "bg-gold shadow-[0_0_8px_oklch(0.78_0.13_84/0.8)]"
        : status === "danger"
          ? "bg-emergency shadow-[0_0_8px_oklch(0.6_0.24_26/0.8)]"
          : "bg-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/5 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}