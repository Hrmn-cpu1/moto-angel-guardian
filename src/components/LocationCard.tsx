import { MapPin, Radio } from "lucide-react";
import type { GeoPosition } from "@/hooks/useGeolocation";

interface Props {
  position: GeoPosition | null;
  lastSync?: string;
}

export function LocationCard({ position, lastSync }: Props) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Seu caminho hoje
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <MapPin size={16} className="text-gold" />
            {position
              ? position.simulated
                ? "São Paulo, SP (simulado)"
                : "Localização atual"
              : "GPS aguardando"}
          </h3>
          {position && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-success">
            <Radio size={12} /> GPS
          </span>
          <span className="text-[10px] text-muted-foreground">
            {lastSync ? `Sync ${lastSync}` : "—"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Clima</p>
          <p className="text-sm font-semibold text-foreground">24°C</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Vento</p>
          <p className="text-sm font-semibold text-foreground">12 km/h</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Visib.</p>
          <p className="text-sm font-semibold text-foreground">Boa</p>
        </div>
      </div>
    </div>
  );
}
