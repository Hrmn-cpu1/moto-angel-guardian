import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Battery, Bell, Satellite, Signal, SignalZero } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  gpsOnline: boolean;
  sharing?: boolean;
}

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener?: (t: string, l: () => void) => void;
};

/** Slim translucent status strip floating over the full-screen home map. */
export function HomeTopBar({ gpsOnline, sharing = false }: Props) {
  const { user } = useAuth();
  const [battery, setBattery] = useState<number | null>(null);
  const [conn, setConn] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryLike>;
      connection?: {
        effectiveType?: string;
        addEventListener?: (t: string, l: () => void) => void;
      };
    };
    let cancelled = false;
    void nav.getBattery?.().then((b) => {
      if (cancelled) return;
      const read = () => setBattery(Math.round(b.level * 100));
      read();
      b.addEventListener?.("levelchange", read);
    });
    const c = nav.connection;
    if (c) {
      const read = () => setConn(c.effectiveType?.toUpperCase() ?? null);
      read();
      c.addEventListener?.("change", read);
    }
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const initial = (user?.name ?? "M").slice(0, 1).toUpperCase();

  return (
    <div className="pointer-events-auto absolute inset-x-3 top-3 z-30 flex items-center gap-2.5 rounded-full border border-gold/25 bg-black/70 px-3 py-2 backdrop-blur-md">
      <Link to="/profile" aria-label="Abrir perfil" className="shrink-0">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full gold-gradient text-xs font-black text-black">
            {initial}
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-bold text-foreground">
          {user?.name?.split(" ")[0] ?? "Motociclista"}
        </p>
        <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-gold">
          <span
            className={`h-1.5 w-1.5 rounded-full ${gpsOnline ? "bg-gold" : "bg-muted-foreground"}`}
          />
          {sharing ? "Compartilhando" : gpsOnline ? "Protegido" : "Sem GPS"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[9px] font-semibold text-muted-foreground">
        <span
          className={`flex items-center gap-0.5 ${gpsOnline ? "text-gold" : ""}`}
          title="GPS"
          aria-label={gpsOnline ? "GPS ativo" : "GPS inativo"}
        >
          <Satellite size={12} />
        </span>
        <span className="flex items-center gap-0.5" aria-label="Conexão">
          {online ? <Signal size={12} /> : <SignalZero size={12} className="text-emergency" />}
          {conn && <span>{conn}</span>}
        </span>
        {battery != null && (
          <span className="flex items-center gap-0.5" aria-label="Bateria">
            <Battery size={12} />
            {battery}%
          </span>
        )}
      </div>

      <Link
        to="/notifications"
        aria-label="Notificações"
        className="shrink-0 rounded-full border border-white/10 p-1.5 text-gold"
      >
        <Bell size={14} />
      </Link>
    </div>
  );
}
