import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Menu, Siren, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const left = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/notifications", label: "Alertas", icon: Bell },
] as const;

const right = [
  { to: "/community", label: "Amigos", icon: Users },
  { to: "/profile", label: "Mais", icon: Menu },
] as const;

// Reference bottom bar: 4 gold icon tabs with the raised red EMERGÊNCIA button
// docked at the centre.
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
        {left.map((it) => (
          <Tab key={it.to} {...it} />
        ))}

        <div className="relative w-20 shrink-0">
          <Link
            to="/sos"
            aria-label="Emergência"
            className="absolute -top-6 left-1/2 flex h-16 w-16 -translate-x-1/2 flex-col items-center justify-center rounded-full border-4 border-[oklch(0.12_0_0)] bg-emergency text-white shadow-[0_0_24px_oklch(0.586_0.213_27.5/0.7)]"
          >
            <Siren size={20} strokeWidth={2.2} />
            <span className="mt-0.5 text-[7px] font-black uppercase tracking-wider">
              Emergência
            </span>
          </Link>
        </div>

        {right.map((it) => (
          <Tab key={it.to} {...it} />
        ))}
      </div>
    </nav>
  );
}
