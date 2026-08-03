import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Menu, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/alerts", label: "Alertas", icon: Bell },
  { to: "/community", label: "Comunidade", icon: Users },
  { to: "/profile", label: "Mais", icon: Menu },
] as const;

// Four gold tabs. The emergency trigger is an independent floating button
// rendered by the screens themselves (SosFab), not a tab.
export function BottomNavigation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const Tab = ({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) => (
    <Link
      to={to}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-semibold uppercase tracking-wider transition-colors",
        isActive(to) ? "text-gold" : "text-muted-foreground hover:text-gold",
      )}
    >
      <Icon size={20} strokeWidth={isActive(to) ? 2.4 : 1.9} />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-[oklch(0.12_0_0)]">
      <div className="relative mx-auto flex max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((it) => (
          <Tab key={it.to} {...it} />
        ))}
      </div>
    </nav>
  );
}
