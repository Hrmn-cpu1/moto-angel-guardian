import { Link } from "@tanstack/react-router";
import { Bell, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title?: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
  showBell?: boolean;
}

export function Header({ title, subtitle, back, right, showBell }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-gold/10 bg-black/70 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex min-h-14 items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {back && (
            <Link
              to={back}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/20 text-gold transition hover:bg-gold/10"
              aria-label="Voltar"
            >
              <ChevronLeft size={18} />
            </Link>
          )}
          <div className="min-w-0">
            {subtitle && (
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {subtitle}
              </p>
            )}
            {title && (
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {right}
          {showBell && (
            <Link
              to="/notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-gold transition hover:bg-gold/10"
              aria-label="Notificações"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emergency" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
