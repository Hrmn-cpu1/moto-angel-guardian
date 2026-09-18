import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Menu, Users } from "lucide-react";
import type { SosController } from "@/components/AppShell";
import { SosHoldButton } from "@/components/SosHoldButton";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/alerts", label: "Alertas", icon: Bell },
  { to: "/community", label: "Comunidade", icon: Users },
  { to: "/profile", label: "Mais", icon: Menu },
] as const;

export function BottomNavigation({
  cockpit = false,
  sos,
}: {
  cockpit?: boolean;
  sos?: SosController;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const Tab = ({
    to,
    label,
    icon: Icon,
  }: {
    to: string;
    label: string;
    icon: typeof Home;
  }) => (
    <Link
      to={to}
      aria-current={isActive(to) ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors",
        isActive(to) ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-gold",
      )}
    >
      <Icon size={20} strokeWidth={isActive(to) ? 2.4 : 1.9} />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-map-panel/98 backdrop-blur-xl",
        cockpit && "border-t-white/15",
      )}
    >
      <div className="relative mx-auto flex max-w-md items-stretch gap-1 px-2 pb-[env(safe-area-inset-bottom)]">
        <Tab {...tabs[0]} />
        <Tab {...tabs[1]} />

        {cockpit && sos ? (
          <div className="relative flex w-[92px] shrink-0 items-end justify-center">
            <div className="absolute -top-[30px] left-1/2 z-50 -translate-x-1/2">
              <SosHoldButton
                variant="nav"
                disabled={sos.busy || sos.recovering}
                onHoldComplete={(heldMs) => sos.trigger(heldMs)}
              />
            </div>
          </div>
        ) : (
          <div className="w-1 shrink-0" aria-hidden="true" />
        )}

        <Tab {...tabs[2]} />
        <Tab {...tabs[3]} />
      </div>
    </nav>
  );
}
