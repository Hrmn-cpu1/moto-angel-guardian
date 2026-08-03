import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Crosshair, Flame, Layers, TrafficCone } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HomeTopBar } from "@/components/HomeTopBar";
import { SosFab } from "@/components/SosFab";
import { LocationPermissionGate } from "@/components/LocationPermissionGate";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAlerts } from "@/hooks/useAlerts";
import { useOnlineRiders } from "@/hooks/useOnlineRiders";
import { useRiskZones } from "@/hooks/useRiskZones";
import { usePartners } from "@/hooks/usePartners";
import { useServerFn } from "@tanstack/react-start";
import { searchPOIs, type POI } from "@/lib/pois.functions";
import { LoadingScreen } from "@/components/LoadingScreen";

const RealMap = lazy(() => import("@/components/RealMap"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Início — Moto Anjo" },
      { name: "description", content: "Painel de proteção e recursos Moto Anjo." },
      { property: "og:title", content: "Início — Moto Anjo" },
      { property: "og:description", content: "Painel de proteção e recursos Moto Anjo." },
    ],
  }),
  component: Dashboard,
});

/**
 * Home = live safety map (Waze/Uber style), full screen, dark premium theme.
 * Layers: traffic, risk heatmap, online riders, recent incidents and support
 * points (hospitals, fuel, workshops, police, partners).
 */
function Dashboard() {
  const { user, loading } = useAuth();
  const { position, capture, startWatch, stopWatch, watching } = useGeolocation();
  const [granted, setGranted] = useState(false);
  const [follow, setFollow] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [showSupport, setShowSupport] = useState(true);
  const [pois, setPois] = useState<POI[]>([]);
  const fetchPOIs = useServerFn(searchPOIs);
  const { alerts } = useAlerts(position);
  const { riders } = useOnlineRiders(position);
  const { risks } = useRiskZones(position);
  const { located: locatedPartners } = usePartners();

  useEffect(() => {
    if (!granted) return;
    void capture();
    startWatch();
    return () => stopWatch();
  }, [granted, capture, startWatch, stopWatch]);

  useEffect(() => {
    if (!position || !showSupport) return;
    fetchPOIs({ data: { lat: position.lat, lng: position.lng, radius: 3000 } })
      .then((r) => setPois(r.pois))
      .catch((e) => console.error(e));
  }, [position, fetchPOIs, showSupport]);

  if (loading || !user) return <LoadingScreen />;

  if (!granted) {
    return (
      <AppShell>
        <div className="px-5 pt-8">
          <LocationPermissionGate onGranted={() => setGranted(true)} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="relative min-h-screen w-full overflow-hidden bg-background">
        <ClientOnly
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
              Preparando mapa...
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-gold">
                Carregando mapa...
              </div>
            }
          >
            <RealMap
              center={position ? { lat: position.lat, lng: position.lng } : null}
              accuracy={position?.accuracy ?? null}
              follow={follow}
              zoom={16}
              rounded={false}
              showTraffic={showTraffic}
              showHeatmap={showHeat}
              riskPoints={risks}
              pois={showSupport ? pois : []}
              alerts={alerts.map((a) => ({
                id: a.id,
                type: a.type,
                title: a.title,
                lat: a.lat,
                lng: a.lng,
              }))}
              riders={riders.map((r) => ({
                id: r.user_id,
                name: r.name,
                avatarUrl: r.avatar_url,
                lat: r.lat,
                lng: r.lng,
              }))}
              partners={
                showSupport
                  ? locatedPartners.map((p) => ({
                      id: p.id,
                      name: p.name,
                      benefit: p.benefit,
                      logoUrl: p.logo_url,
                      featured: p.featured,
                      lat: p.lat as number,
                      lng: p.lng as number,
                    }))
                  : []
              }
              className="absolute inset-0"
            />
          </Suspense>
        </ClientOnly>

        {position && follow && (
          <div className="moto-user-location-marker left-1/2 top-1/2" aria-label="Sua localização">
            <span className="moto-user-location-marker__pulse" />
            <span className="moto-user-location-marker__pin">
              <span />
            </span>
          </div>
        )}

        <HomeTopBar gpsOnline={watching && !!position} />

        {/* Layer controls */}
        <div className="absolute right-3 top-[76px] z-30 flex flex-col gap-2">
          <LayerToggle
            active={showTraffic}
            onClick={() => setShowTraffic((v) => !v)}
            label="Trânsito"
            icon={<TrafficCone size={14} />}
          />
          <LayerToggle
            active={showHeat}
            onClick={() => setShowHeat((v) => !v)}
            label="Áreas de risco"
            icon={<Flame size={14} />}
          />
          <LayerToggle
            active={showSupport}
            onClick={() => setShowSupport((v) => !v)}
            label="Apoio"
            icon={<Layers size={14} />}
          />
          <LayerToggle
            active={follow}
            onClick={() => {
              setFollow(true);
              void capture();
            }}
            label="Centralizar"
            icon={<Crosshair size={14} />}
          />
        </div>

        {/* Live summary */}
        <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-30 flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-widest">
          <span className="rounded-full border border-gold/30 bg-black/75 px-3 py-1.5 text-gold">
            {riders.length} online
          </span>
          <span className="rounded-full border border-emergency/40 bg-black/75 px-3 py-1.5 text-emergency">
            {alerts.length} ocorrências
          </span>
        </div>

        <SosFab
          position={
            position
              ? { lat: position.lat, lng: position.lng, accuracy: position.accuracy ?? null }
              : null
          }
        />
      </div>
    </AppShell>
  );
}

function LayerToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition ${
        active
          ? "border-gold bg-gold/20 text-gold"
          : "border-white/10 bg-black/70 text-muted-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
