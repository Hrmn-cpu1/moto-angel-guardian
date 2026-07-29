import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Crosshair, Share2, Navigation, MapPin, Fuel, Wrench, Cross, Shield, LocateFixed, LocateOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { SOSFab } from "@/components/SOSFab";
import { LocationPermissionGate } from "@/components/LocationPermissionGate";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHistory } from "@/hooks/useHistory";
import { useServerFn } from "@tanstack/react-start";
import { searchPOIs, type POI } from "@/lib/pois.functions";

const RealMap = lazy(() => import("@/components/RealMap"));

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Mapa — Moto Anjo" },
      { name: "description", content: "Sua posição, pontos de apoio e rotas seguras." },
      { property: "og:title", content: "Mapa — Moto Anjo" },
      { property: "og:description", content: "Sua posição, pontos de apoio e rotas seguras." },
    ],
  }),
  component: MapPage,
});

const iconFor = {
  hospital: Cross,
  fuel: Fuel,
  shop: Wrench,
  anjo: Shield,
};

const labelFor: Record<POI["type"], string> = {
  hospital: "Hospital",
  fuel: "Combustível",
  shop: "Oficina",
  anjo: "Ponto Moto Anjo",
};

function MapPage() {
  const { position, capture, share, startWatch, stopWatch, watching } = useGeolocation();
  const { add } = useHistory();
  const [selected, setSelected] = useState<POI | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [loadingPois, setLoadingPois] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [follow, setFollow] = useState(true);
  const fetchPOIs = useServerFn(searchPOIs);

  useEffect(() => {
    if (!permissionGranted) return;
    void capture();
    startWatch();
    return () => stopWatch();
  }, [capture, permissionGranted, startWatch, stopWatch]);

  useEffect(() => {
    if (!position) return;
    setLoadingPois(true);
    fetchPOIs({ data: { lat: position.lat, lng: position.lng, radius: 3000 } })
      .then((r) => setPois(r.pois))
      .catch((e) => console.error(e))
      .finally(() => setLoadingPois(false));
  }, [position, fetchPOIs]);

  const doShare = async () => {
    if (!position) return;
    const url = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
    const ok = await share("Minha localização — Moto Anjo", url);
    add({
      type: "share",
      title: "Localização compartilhada",
      description: ok ? url : "Copiado para área de transferência",
    });
  };

  const openRoute = (target?: POI) => {
    if (!position) return;
    const dest = target ? `${target.lat},${target.lng}` : "";
    const url = target
      ? `https://www.google.com/maps/dir/?api=1&origin=${position.lat},${position.lng}&destination=${dest}`
      : `https://www.google.com/maps?q=${position.lat},${position.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell>
      <Header title="Mapa" subtitle="Onde você está" showBell />

      {!permissionGranted ? (
        <LocationPermissionGate onGranted={() => setPermissionGranted(true)} />
      ) : (
      <div className="px-5 pt-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl glass-card">
          <ClientOnly fallback={
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
              Preparando mapa...
            </div>
          }>
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
                Carregando mapa...
              </div>
            }>
              <RealMap
                center={position ? { lat: position.lat, lng: position.lng } : null}
                accuracy={position?.accuracy ?? null}
                follow={follow}
                pois={pois}
                onPoiSelect={setSelected}
                className="absolute inset-0"
              />
            </Suspense>
          </ClientOnly>

          {position && follow && (
            <div className="moto-user-location-marker left-1/2 top-1/2" aria-label="Sua localização atual">
              <span className="moto-user-location-marker__pulse" />
              <span className="moto-user-location-marker__pin">
                <span />
              </span>
            </div>
          )}

          {selected && (
            <div className="absolute inset-x-3 bottom-3 rounded-2xl glass-card p-3 animate-fade-up">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold">
                    {(() => { const Ic = iconFor[selected.type]; return <Ic size={12} />; })()}
                    {labelFor[selected.type]}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{selected.name}</p>
                  {selected.address && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{selected.address}</p>
                  )}
                </div>
                <button
                  onClick={() => openRoute(selected)}
                  className="flex items-center gap-1 rounded-full gold-gradient px-3 py-1.5 text-[11px] font-semibold text-black"
                >
                  <Navigation size={12} /> Rota
                </button>
              </div>
            </div>
          )}

          {loadingPois && !selected && (
            <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[10px] uppercase tracking-widest text-gold">
              Buscando pontos...
            </div>
          )}

          <button
            onClick={() => setFollow((f) => !f)}
            className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition ${
              follow
                ? "border-gold bg-gold/15 text-gold shadow-[0_0_20px_-6px_oklch(0.78_0.13_84/0.6)]"
                : "border-white/10 bg-black/70 text-muted-foreground"
            }`}
            aria-pressed={follow}
          >
            {follow ? <LocateFixed size={12} /> : <LocateOff size={12} />}
            {follow ? "Seguindo" : "Livre"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/40 px-4 py-3">
            <MapPin size={14} className="text-gold" />
            <span className="font-mono text-xs text-muted-foreground">
              {position
                ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${position.accuracy ? ` · ±${Math.round(position.accuracy)}m` : ""}${position.simulated ? " (sim)" : ""}${watching ? " · ao vivo" : ""}`
                : "Localizando..."}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <OutlineButton onClick={() => { setFollow(true); void capture(); }} size="sm">
              <Crosshair size={14} /> Centralizar
            </OutlineButton>
            <OutlineButton onClick={doShare} size="sm">
              <Share2 size={14} /> Compartilhar
            </OutlineButton>
          </div>
          <GoldButton size="md" onClick={() => openRoute()}>
            <Navigation size={14} /> Abrir no Google Maps
          </GoldButton>
        </div>
      </div>
      )}

      <SOSFab />
    </AppShell>
  );
}