import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Map, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/map", label: "Mapa", icon: Map },
  { to: "/community", label: "Comunidade", icon: Users },
  { to: "/profile", label: "Perfil", icon: User },
] as const;

export function BottomNavigation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-black/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((it) => {
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium uppercase tracking-widest transition-colors",
                active ? "text-gold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span>{it.label}</span>
              {active && <span className="h-0.5 w-6 rounded-full bg-gold" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}