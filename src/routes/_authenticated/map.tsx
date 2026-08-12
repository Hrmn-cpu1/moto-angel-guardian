import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  Crosshair,
  Share2,
  Navigation,
  MapPin,
  Fuel,
  Wrench,
  Cross,
  Shield,
  LocateFixed,
  LocateOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { LocationPermissionGate } from "@/components/LocationPermissionGate";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { MapSosButton } from "@/components/MapSosButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHistory } from "@/hooks/useHistory";
import { useAlerts } from "@/hooks/useAlerts";
import { useNearbyRiders } from "@/hooks/useNearbyRiders";
import { useMapLayers } from "@/hooks/useMapLayers";
import { rotuloDeRiders } from "@/lib/map-layers";
import { abrirNavegacaoExterna } from "@/lib/external-navigation";
import { Users, BadgePercent, Phone } from "lucide-react";
import { usePartners, filterPartners, BENEFIT_FILTERS, type Partner } from "@/hooks/usePartners";
import { useServerFn } from "@tanstack/react-start";
import { searchPOIs, type POI } from "@/lib/pois.functions";

const RealMap = lazy(() => import("@/components/RealMap"));

export const Route = createFileRoute("/_authenticated/map")({
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
  police: Shield,
  anjo: Shield,
};

const labelFor: Record<POI["type"], string> = {
  hospital: "Hospital",
  fuel: "Combustível",
  shop: "Oficina",
  police: "Posto policial",
  anjo: "Ponto Moto Anjo",
};

function MapPage() {
  const { position, capture, share, startWatch, stopWatch, watching } = useGeolocation();
  const { add } = useHistory();
  const [selected, setSelected] = useState<POI | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [loadingPois, setLoadingPois] = useState(false);
  // Mesma fonte de verdade da Home (RC2 checkpoint D).
  const { concedida: permissionGranted } = useLocationPermission();
  const [follow, setFollow] = useState(true);
  const fetchPOIs = useServerFn(searchPOIs);
  const { alerts } = useAlerts(position);
  // Duas fontes separadas (RC2 hotfix P0.3-C): contatos autorizados continuam
  // aparecendo mesmo sem opt-in comunitário; a camada pública exige opt-in.
  // O que o mapa DESENHA é decidido pelo controle da interface (P0.4-C).
  const { camadas, alternar } = useMapLayers();
  const { todos: riders, contatos, comunidade } = useNearbyRiders(position, 50, camadas);
  const rotuloRiders = rotuloDeRiders(camadas, contatos.length, comunidade.length);
  const [selectedRider, setSelectedRider] = useState<{ name: string } | null>(null);
  const { located: locatedPartners } = usePartners();
  const [benefitFilter, setBenefitFilter] = useState("todos");
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const visiblePartners = filterPartners(locatedPartners, benefitFilter);

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

  // Toda navegação externa passa pela ponte central: nunca navega a WebView
  // no lugar, nunca constrói intent:// (RC2 checkpoint E).
  const openRoute = (target?: POI) => {
    if (!position) return;
    const destino = target
      ? { latitude: target.lat, longitude: target.lng, label: target.name }
      : { latitude: position.lat, longitude: position.lng };
    void abrirNavegacaoExterna("google", destino);
  };

  return (
    <AppShell>
      <Header title="Mapa" subtitle="Onde você está" showBell />

      {!permissionGranted ? (
        <LocationPermissionGate onGranted={() => undefined} />
      ) : (
        <div className="px-5 pt-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl glass-card">
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
                  pois={pois}
                  onPoiSelect={setSelected}
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
                  onRiderSelect={(r) => setSelectedRider({ name: r.name })}
                  partners={visiblePartners.map((p) => ({
                    id: p.id,
                    name: p.name,
                    benefit: p.benefit,
                    logoUrl: p.logo_url,
                    featured: p.featured,
                    lat: p.lat as number,
                    lng: p.lng as number,
                  }))}
                  onPartnerSelect={(p) => {
                    const full = locatedPartners.find((x) => x.id === p.id) ?? null;
                    setSelectedPartner(full);
                    setSelected(null);
                  }}
                  className="absolute inset-0"
                />
              </Suspense>
            </ClientOnly>

            {position && follow && (
              <div
                className="moto-user-location-marker left-1/2 top-1/2"
                aria-label="Sua localização atual"
              >
                <span className="moto-user-location-marker__pulse" />
                <span className="moto-user-location-marker__pin">
                  <span />
                </span>
              </div>
            )}

            {/* Sem prop de posição: o SOS captura o GPS na hora do acionamento. */}
            <MapSosButton />

            {selected && (
              <div className="absolute inset-x-3 bottom-3 rounded-2xl glass-card p-3 animate-fade-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold">
                      {(() => {
                        const Ic = iconFor[selected.type];
                        return <Ic size={12} />;
                      })()}
                      {labelFor[selected.type]}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      {selected.name}
                    </p>
                    {selected.address && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {selected.address}
                      </p>
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

            {selectedPartner && !selected && (
              <div className="absolute inset-x-3 bottom-3 rounded-2xl glass-card p-3 animate-fade-up">
                <div className="flex items-start gap-3">
                  {selectedPartner.logo_url ? (
                    <img
                      src={selectedPartner.logo_url}
                      alt={`Logo ${selectedPartner.name}`}
                      loading="lazy"
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-xl border border-gold/30 bg-black/60 object-contain p-1"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-black/60 text-gold">
                      <BadgePercent size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-gold">
                      {selectedPartner.benefit}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      {selectedPartner.name}
                    </p>
                    {selectedPartner.address && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {selectedPartner.address}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() =>
                          void abrirNavegacaoExterna("google", {
                            latitude: selectedPartner.lat,
                            longitude: selectedPartner.lng,
                            label: selectedPartner.name,
                          })
                        }
                        className="flex items-center gap-1 rounded-full gold-gradient px-3 py-1.5 text-[11px] font-semibold text-black"
                      >
                        <Navigation size={12} /> Rota
                      </button>
                      {selectedPartner.phone && (
                        <a
                          href={`tel:${selectedPartner.phone}`}
                          className="flex items-center gap-1 rounded-full border border-gold/40 px-3 py-1.5 text-[11px] font-semibold text-gold"
                        >
                          <Phone size={12} /> Ligar
                        </a>
                      )}
                      <button
                        onClick={() => setSelectedPartner(null)}
                        className="ml-auto text-[11px] text-muted-foreground"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(selectedRider || rotuloRiders) && !selected && (
              <div className="absolute left-3 bottom-3 flex items-center gap-1.5 rounded-full border border-gold/30 bg-black/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
                <Users size={12} />
                {selectedRider ? selectedRider.name : rotuloRiders}
              </div>
            )}

            {/* Controles do mapa em uma coluna só (P0.5-C).
                Antes os dois usavam `absolute right-3 top-3` e ficavam um
                em cima do outro: o de baixo era inalcançável. Um container
                empilha os dois; F2/F3 revisa tamanho e posição depois. */}
            <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={camadas.comunidade}
                onClick={() => alternar("comunidade")}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  camadas.comunidade
                    ? "border-gold/50 bg-gold/20 text-gold"
                    : "border-white/15 bg-black/70 text-muted-foreground"
                }`}
              >
                <Users size={12} />
                Outros motoqueiros
              </button>

              <button
                onClick={() => setFollow((f) => !f)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition ${
                  follow
                    ? "border-gold bg-gold/15 text-gold shadow-[0_0_20px_-6px_oklch(0.83_0.169_85/0.6)]"
                    : "border-white/10 bg-black/70 text-muted-foreground"
                }`}
                aria-pressed={follow}
              >
                {follow ? <LocateFixed size={12} /> : <LocateOff size={12} />}
                {follow ? "Seguindo" : "Livre"}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {BENEFIT_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setBenefitFilter(f.id);
                    setSelectedPartner(null);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition ${
                    benefitFilter === f.id
                      ? "border-gold bg-gold/15 text-gold"
                      : "border-white/10 bg-black/40 text-muted-foreground"
                  }`}
                  aria-pressed={benefitFilter === f.id}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {visiblePartners.length}{" "}
              {visiblePartners.length === 1 ? "parceiro no mapa" : "parceiros no mapa"}
            </p>

            <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/40 px-4 py-3">
              <MapPin size={14} className="text-gold" />
              <span className="font-mono text-xs text-muted-foreground">
                {position
                  ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${position.accuracy ? ` · ±${Math.round(position.accuracy)}m` : ""}${watching ? " · ao vivo" : ""}`
                  : "Localizando..."}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <OutlineButton
                onClick={() => {
                  setFollow(true);
                  void capture();
                }}
                size="sm"
              >
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
    </AppShell>
  );
}
