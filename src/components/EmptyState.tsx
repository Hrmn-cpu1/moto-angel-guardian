import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-gold/5 text-gold">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}