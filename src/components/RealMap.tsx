/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { abrirNavegacaoExterna } from "@/lib/external-navigation";
import { passosDoEnquadramento } from "@/lib/navigation-cue";
import type { POI } from "@/lib/pois.functions";

// Premium dark style with gold accents
// Dark, but legible: streets must stay clearly readable on AMOLED screens and
// in daylight. Keeping the road geometry near-black made the base map look
// completely black on physical Android devices even with tiles loaded fine.
export const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#15161a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e6e6e6" }],
  },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3a3d44" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#22242a" }] },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#4a4a44" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#6b5a2a" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#D4AF37" }, { weight: 0.5 }],
  },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#d8d8d8" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1620" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5a7a8c" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#15161a" }] },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#1b241b" }],
  },
];

type LoaderState = "idle" | "loading" | "ready" | "error";

/**
 * Risk areas are painted with layered translucent circles. Google removed the
 * visualization HeatmapLayer in Maps JS 3.65 (it now throws), so this keeps the
 * same visual language (gold -> red glow) with plain overlays.
 */
export const RISK_BANDS = [
  // RC3.2: opacidades reduzidas ~40%. A camada é REAL (vem de `risk_zones`),
  // então continua no mapa — mas ela informa, não decora: com os valores
  // antigos as manchas competiam com o traçado da rota e com as ruas, que é
  // o que a pessoa precisa enxergar pilotando.
  { scale: 1.0, color: "#D92323", opacity: 0.06 },
  { scale: 0.62, color: "#F3D675", opacity: 0.09 },
  { scale: 0.32, color: "#D92323", opacity: 0.16 },
] as const;

let loaderPromise: Promise<typeof google> | null = null;
const DEFAULT_CENTER = { lat: -23.55052, lng: -46.633308 };

// Google does NOT reject the loader when the API key is rejected (invalid key,
// domain not authorized, billing off). It calls the global gm_authFailure hook
// and paints its own grey "Oops" box — which is what users see as a blank map.
// Track it globally so every RealMap instance can show a proper fallback.
let authFailed = false;
const authFailureListeners = new Set<() => void>();

function registerAuthFailureHandler(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  authFailureListeners.add(listener);
  const w = window as unknown as { gm_authFailure?: () => void };
  if (!w.gm_authFailure) {
    w.gm_authFailure = () => {
      authFailed = true;
      authFailureListeners.forEach((l) => l());
    };
  }
  return () => authFailureListeners.delete(listener);
}

type UserLocationOverlay = google.maps.OverlayView & {
  setPosition: (position: google.maps.LatLngLiteral) => void;
};

export function loadGoogleMaps(apiKey: string, channel?: string): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { google?: typeof google }).google?.maps) {
    return Promise.resolve((window as unknown as { google: typeof google }).google);
  }
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__motoAnjoInitMap_${Date.now()}`;
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      resolve((window as unknown as { google: typeof google }).google);
      delete (window as unknown as Record<string, unknown>)[cbName];
    };
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      loading: "async",
      callback: cbName,
    });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export interface MapAlert {
  id: string;
  type: string;
  title: string;
  lat: number;
  lng: number;
}

export interface MapRider {
  id: string;
  name: string;
  avatarUrl?: string | null;
  lat: number;
  lng: number;
}

type RiderOverlay = google.maps.OverlayView & {
  update: (rider: MapRider) => void;
};

export interface MapPartner {
  id: string;
  name: string;
  benefit: string;
  logoUrl?: string | null;
  featured?: boolean;
  lat: number;
  lng: number;
}

type PartnerOverlay = google.maps.OverlayView & {
  update: (partner: MapPartner) => void;
};

function pinSvg(color: string, glyphColor: string, glyph: string): string {
  const paths: Record<string, string> = {
    hospital:
      '<path d="M12 8v8M8 12h8" stroke="' +
      glyphColor +
      '" stroke-width="2.4" stroke-linecap="round"/>',
    fuel:
      '<path d="M10 8h4v9h-4z M14 11h2v4a1 1 0 001 1" stroke="' +
      glyphColor +
      '" stroke-width="1.5" fill="none"/>',
    shop:
      '<path d="M9 15l6-6M11 9h4v4" stroke="' +
      glyphColor +
      '" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    police:
      '<path d="M12 7l4 1.8v3c0 2.4-1.7 4.2-4 5-2.3-.8-4-2.6-4-5v-3z" fill="none" stroke="' +
      glyphColor +
      '" stroke-width="1.6" stroke-linejoin="round"/>',
    anjo:
      '<path d="M12 8l2 3 3 .4-2.2 2.1.5 3-2.3-1.3-2.3 1.3.5-3L9 11.4l3-.4z" fill="' +
      glyphColor +
      '"/>',
    you: '<circle cx="12" cy="12" r="4" fill="' + glyphColor + '"/>',
    perigo:
      '<path d="M12 7l5 9H7l5-9z" fill="none" stroke="' +
      glyphColor +
      '" stroke-width="1.8" stroke-linejoin="round"/>',
    acidente:
      '<path d="M12 7l1.6 3.4 3.4.6-2.6 2.4.7 3.6-3.1-1.8-3.1 1.8.7-3.6L7 11l3.4-.6z" fill="' +
      glyphColor +
      '"/>',
    bloqueio: '<path d="M8 10h8v4H8z" fill="' + glyphColor + '"/>',
    // RC2 checkpoint B: alerta de SOS da comunidade.
    sos:
      '<path d="M11 7h2v6h-2zM11 15h2v2h-2z" fill="' + glyphColor + '"/>',
    roubo:
      '<path d="M12 7c2 0 3.5 1.5 3.5 3.5S14 14 12 14s-3.5-1.5-3.5-3.5S10 7 12 7z" fill="none" stroke="' +
      glyphColor +
      '" stroke-width="1.8"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 30">
    <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.6"/></filter></defs>
    <path filter="url(#s)" d="M12 0C5.4 0 0 5.2 0 11.6 0 20.4 12 30 12 30s12-9.6 12-18.4C24 5.2 18.6 0 12 0z" fill="${color}" stroke="#050505" stroke-width="1"/>
    <circle cx="12" cy="12" r="7" fill="#050505"/>
    ${paths[glyph] ?? ""}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface Props {
  center?: { lat: number; lng: number } | null;
  accuracy?: number | null;
  follow?: boolean;
  pois?: POI[];
  onPoiSelect?: (poi: POI) => void;
  alerts?: MapAlert[];
  onAlertSelect?: (alert: MapAlert) => void;
  riders?: MapRider[];
  onRiderSelect?: (rider: MapRider) => void;
  partners?: MapPartner[];
  onPartnerSelect?: (partner: MapPartner) => void;
  /** Aggregated risk points for the danger heatmap. */
  riskPoints?: { lat: number; lng: number; weight: number }[];
  showTraffic?: boolean;
  showHeatmap?: boolean;
  /**
   * Destino da Viagem Segura. Aceita coordenada ou endereço — é o que o
   * normalizador de destino já produz. Sem destino, nenhuma rota é traçada.
   */
  destination?: { lat?: number; lng?: number; address?: string } | null;
  /** Resultado real do Google. `null` quando não há rota calculável. */
  onRoute?: (rota: RouteInfo | null) => void;
  zoom?: number;
  /** Rounded corners (off for the full-screen home map). */
  rounded?: boolean;
  interactive?: boolean;
  className?: string;
}

export interface RouteInfo {
  distanciaKm: number;
  duracaoMin: number;
  /** Próxima instrução em texto simples, sem HTML. */
  proximaInstrucao: string | null;
  /** Distância real até a próxima manobra, em metros. `null` sem passo. */
  proximaDistanciaM: number | null;
  /** Código de manobra do Google (`turn-left`, `roundabout-right`...). */
  proximaManobra: string | null;
  destinoTexto: string | null;
}

export default function RealMap({
  center,
  accuracy = null,
  follow = true,
  pois = [],
  onPoiSelect,
  alerts = [],
  onAlertSelect,
  riders = [],
  onRiderSelect,
  partners = [],
  onPartnerSelect,
  riskPoints = [],
  showTraffic = false,
  showHeatmap = false,
  destination = null,
  onRoute,
  zoom = 15,
  rounded = true,
  interactive = true,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<UserLocationOverlay | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const poiMarkersRef = useRef<google.maps.Marker[]>([]);
  const alertMarkersRef = useRef<google.maps.Marker[]>([]);
  const riderOverlaysRef = useRef<Map<string, RiderOverlay>>(new Map());
  const partnerOverlaysRef = useRef<Map<string, PartnerOverlay>>(new Map());
  const heatCirclesRef = useRef<google.maps.Circle[]>([]);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  /** Destino já enquadrado — impede a câmera de brigar com o modo "seguir". */
  const enquadradoParaRef = useRef<string | null>(null);
  const onRouteRef = useRef(onRoute);
  onRouteRef.current = onRoute;
  const [state, setState] = useState<LoaderState>("idle");
  // null = ainda não medido; false = medido e sem área; true = pronto.
  // O mapa só é construído quando isto vira true. Ver o efeito de medição.
  const [hasArea, setHasArea] = useState<boolean | null>(null);
  // Incrementa a cada "Tentar novamente": reexecuta o efeito de inicialização.
  const [tentativa, setTentativa] = useState(0);

  // Prefer the project's own Google Cloud key (works on custom domains and in
  // the Android/Capacitor WebView); fall back to the Lovable-managed key.
  const ownKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const managedKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const apiKey = (ownKey && ownKey.trim()) || managedKey;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
    | string
    | undefined;

  const fallbackCenter = useMemo(() => center ?? DEFAULT_CENTER, []);
  const initialZoom = useRef(zoom).current;
  const radius = rounded ? "rounded-3xl" : "";

  useEffect(() => {
    if (authFailed) setState("error");
    return registerAuthFailureHandler(() => setState("error"));
  }, []);

  /**
   * Mede o container antes de entregar ele ao Google.
   *
   * `new google.maps.Map()` fixa o viewport no momento da construção. Se o div
   * estiver com 0 px — o que acontecia quando a altura dependia de `h-full`
   * dentro de um ancestral só com `min-height` — o mapa nasce sem área e o que
   * sobra na tela é o fundo preto do app com os controles por cima. Esperar a
   * primeira medida diferente de zero elimina essa janela.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setHasArea(r.width >= 2 && r.height >= 2);
    };
    medir();
    if (typeof ResizeObserver === "undefined") {
      // WebView antigo sem ResizeObserver: não bloqueia o mapa por falta de
      // instrumento de medida.
      setHasArea(true);
      return;
    }
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!apiKey || !containerRef.current || hasArea !== true) return;
    if (authFailed) {
      setState("error");
      return;
    }
    setState((s) => (s === "error" ? s : "loading"));
    let cancelled = false;
    // Timeout de segurança: sem isto, uma falha silenciosa do loader (rede
    // bloqueada, script preso) deixa a Home em "carregando" para sempre.
    const timeout = setTimeout(() => {
      if (!cancelled && !mapRef.current) setState("error");
    }, 20000);
    loadGoogleMaps(apiKey, channel)
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: fallbackCenter,
          zoom: initialZoom,
          disableDefaultUI: true,
          gestureHandling: interactive ? "greedy" : "none",
          zoomControl: interactive,
          keyboardShortcuts: false,
          clickableIcons: false,
          backgroundColor: "#050505",
          styles: DARK_STYLE,
        });
        mapRef.current = map;
        setState((s) => (s === "error" || authFailed ? "error" : "ready"));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      heatCirclesRef.current.forEach((c) => c.setMap(null));
      heatCirclesRef.current = [];
      trafficRef.current?.setMap(null);
      trafficRef.current = null;
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      accuracyCircleRef.current?.setMap(null);
      accuracyCircleRef.current = null;
      poiMarkersRef.current.forEach((m) => m.setMap(null));
      poiMarkersRef.current = [];
      alertMarkersRef.current.forEach((m) => m.setMap(null));
      alertMarkersRef.current = [];
      riderOverlaysRef.current.forEach((o) => o.setMap(null));
      riderOverlaysRef.current.clear();
      partnerOverlaysRef.current.forEach((o) => o.setMap(null));
      partnerOverlaysRef.current.clear();
    };
  }, [apiKey, channel, fallbackCenter, initialZoom, interactive, hasArea, tentativa]);

  // Traffic layer (toggles without recreating the map)
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;
    if (showTraffic) {
      if (!trafficRef.current) trafficRef.current = new g.maps.TrafficLayer();
      trafficRef.current.setMap(map);
    } else {
      trafficRef.current?.setMap(null);
    }
  }, [showTraffic, state]);

  /**
   * Rota da Viagem Segura.
   *
   * O traçado vem do Google, não de uma linha reta inventada: distância e
   * tempo aparecem na Home e precisam corresponder ao caminho real. A rota é
   * recalculada quando o destino muda ou quando a origem se desloca o
   * suficiente (chave arredondada), nunca a cada ponto do GPS.
   */
  const destKey = destination
    ? `${destination.lat ?? ""},${destination.lng ?? ""},${destination.address ?? ""}`
    : "";
  const originKey = center ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}` : "";

  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;

    const limpar = () => {
      routeRendererRef.current?.setMap(null);
      routeRendererRef.current = null;
    };

    if (!destKey || !center) {
      limpar();
      onRouteRef.current?.(null);
      return;
    }

    const destinoGoogle: google.maps.Place | google.maps.LatLngLiteral | string =
      destination?.lat != null && destination?.lng != null
        ? { lat: destination.lat, lng: destination.lng }
        : (destination?.address ?? "");
    if (!destinoGoogle) {
      limpar();
      onRouteRef.current?.(null);
      return;
    }

    let cancelled = false;
    const service = new g.maps.DirectionsService();
    service
      .route({
        origin: { lat: center.lat, lng: center.lng },
        destination: destinoGoogle as google.maps.LatLngLiteral,
        travelMode: g.maps.TravelMode.DRIVING,
      })
      .then((res) => {
        if (cancelled) return;
        if (!routeRendererRef.current) {
          routeRendererRef.current = new g.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: "#F3D675",
              strokeOpacity: 0.95,
              strokeWeight: 6,
              zIndex: 5,
            },
          });
        }
        routeRendererRef.current.setMap(map);
        routeRendererRef.current.setDirections(res);
        const perna = res.routes[0]?.legs[0];
        if (!perna) {
          onRouteRef.current?.(null);
          return;
        }

        /* Enquadramento (RC3.2 #10).
         *
         * Uma única vez por destino: mostrar o usuário e o trecho seguinte da
         * rota. Não é feito a cada recálculo, senão a câmera brigaria com o
         * modo "seguir" a cada quarteirão. */
        if (enquadradoParaRef.current !== destKey) {
          enquadradoParaRef.current = destKey;
          const passos = perna.steps ?? [];
          const quantos = passosDoEnquadramento(passos.map((s) => s.distance?.value ?? 0));
          if (quantos > 0) {
            const limites = new g.maps.LatLngBounds();
            limites.extend({ lat: center.lat, lng: center.lng });
            passos.slice(0, quantos).forEach((s) => {
              if (s.end_location) limites.extend(s.end_location);
            });
            map.fitBounds(limites, { top: 150, right: 60, bottom: 240, left: 60 });
          }
        }

        const passo = perna.steps?.[0];
        onRouteRef.current?.({
          distanciaKm: (perna.distance?.value ?? 0) / 1000,
          duracaoMin: Math.round((perna.duration?.value ?? 0) / 60),
          proximaInstrucao: passo?.instructions
            ? passo.instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
            : null,
          proximaDistanciaM: passo?.distance?.value ?? null,
          proximaManobra:
            (passo as unknown as { maneuver?: string } | undefined)?.maneuver ?? null,
          destinoTexto: perna.end_address ?? null,
        });
      })
      .catch(() => {
        // Sem rota calculável não se inventa distância: a Home mostra só o
        // destino escolhido.
        if (!cancelled) onRouteRef.current?.(null);
      });

    return () => {
      cancelled = true;
    };
  }, [destKey, originKey, state]);

  useEffect(
    () => () => {
      routeRendererRef.current?.setMap(null);
      routeRendererRef.current = null;
    },
    [],
  );

  // Risk areas — layered translucent circles (HeatmapLayer was removed by Google)
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;
    heatCirclesRef.current.forEach((c) => c.setMap(null));
    heatCirclesRef.current = [];
    if (!showHeatmap || riskPoints.length === 0) return;
    const maxWeight = Math.max(...riskPoints.map((p) => p.weight), 1);
    riskPoints.forEach((p) => {
      const intensity = Math.min(1, p.weight / maxWeight);
      const baseRadius = 260 + intensity * 520;
      RISK_BANDS.forEach((band) => {
        const circle = new g.maps.Circle({
          map,
          center: { lat: p.lat, lng: p.lng },
          radius: baseRadius * band.scale,
          strokeWeight: 0,
          fillColor: band.color,
          fillOpacity: band.opacity * (0.55 + intensity * 0.45),
          clickable: false,
          zIndex: 1,
        });
        heatCirclesRef.current.push(circle);
      });
    });
    return () => {
      heatCirclesRef.current.forEach((c) => c.setMap(null));
      heatCirclesRef.current = [];
    };
  }, [riskPoints, showHeatmap, state]);

  // Update user marker + recenter when center changes
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map || !center) return;
    const g = (window as unknown as { google: typeof google }).google;
    if (!userMarkerRef.current) {
      class MotoUserLocationOverlay extends g.maps.OverlayView {
        private position: google.maps.LatLngLiteral;
        private element: HTMLDivElement | null = null;

        constructor(position: google.maps.LatLngLiteral) {
          super();
          this.position = position;
        }

        onAdd() {
          const element = document.createElement("div");
          element.className = "moto-user-location-marker";
          element.setAttribute("aria-label", "Sua localização atual");
          element.innerHTML =
            '<span class="moto-user-location-marker__pulse"></span><span class="moto-user-location-marker__pin"><span></span></span>';
          this.element = element;
          this.getPanes()?.overlayMouseTarget.appendChild(element);
        }

        draw() {
          const projection = this.getProjection();
          if (!projection || !this.element) return;
          const point = projection.fromLatLngToDivPixel(
            new g.maps.LatLng(this.position.lat, this.position.lng),
          );
          if (!point) return;
          this.element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
        }

        onRemove() {
          this.element?.remove();
          this.element = null;
        }

        setPosition(position: google.maps.LatLngLiteral) {
          this.position = position;
          this.draw();
        }
      }

      const marker = new MotoUserLocationOverlay(center);
      marker.setMap(map);
      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setPosition(center);
    }
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new g.maps.Circle({
        map,
        center,
        radius: accuracy ?? 30,
        strokeColor: "#D4AF37",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#D4AF37",
        fillOpacity: 0.08,
        clickable: false,
      });
    } else {
      accuracyCircleRef.current.setCenter(center);
      if (accuracy != null) accuracyCircleRef.current.setRadius(accuracy);
    }
    if (follow) map.panTo(center);
  }, [center, state, accuracy, follow]);

  // Sync POI markers
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;
    poiMarkersRef.current.forEach((m) => m.setMap(null));
    poiMarkersRef.current = pois.map((p) => {
      const color = p.type === "hospital" ? "#D92323" : "#D4AF37";
      const glyphColor = p.type === "hospital" ? "#F5F5F5" : "#050505";
      const m = new g.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        icon: {
          url: pinSvg(color, glyphColor, p.type),
          scaledSize: new g.maps.Size(30, 38),
          anchor: new g.maps.Point(15, 38),
        },
        title: p.name,
      });
      if (onPoiSelect) m.addListener("click", () => onPoiSelect(p));
      return m;
    });
  }, [pois, onPoiSelect, state]);

  // Sync community alert markers
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;
    alertMarkersRef.current.forEach((m) => m.setMap(null));
    alertMarkersRef.current = alerts.map((a) => {
      const color =
        a.type === "sos" || a.type === "acidente" || a.type === "roubo" ? "#D92323" : "#D4AF37";
      const glyphColor = color === "#D92323" ? "#F5F5F5" : "#D4AF37";
      const m = new g.maps.Marker({
        map,
        position: { lat: a.lat, lng: a.lng },
        icon: {
          url: pinSvg(color, glyphColor, a.type),
          scaledSize: new g.maps.Size(32, 40),
          anchor: new g.maps.Point(16, 40),
        },
        title: a.title,
        zIndex: 20,
      });
      if (onAlertSelect) m.addListener("click", () => onAlertSelect(a));
      return m;
    });
  }, [alerts, onAlertSelect, state]);

  // Sync online rider avatars (live_locations)
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;

    class RiderAvatarOverlay extends g.maps.OverlayView {
      private rider: MapRider;
      private element: HTMLDivElement | null = null;

      constructor(rider: MapRider) {
        super();
        this.rider = rider;
      }

      private render() {
        if (!this.element) return;
        const initials = (this.rider.name || "?").trim().charAt(0).toUpperCase();
        const inner = this.rider.avatarUrl
          ? `<img src="${this.rider.avatarUrl}" alt="${this.rider.name}" referrerpolicy="no-referrer" />`
          : initials;
        this.element.innerHTML = `<span class="moto-rider-marker__avatar" title="${this.rider.name}">${inner}</span><span class="moto-rider-marker__dot"></span>`;
      }

      onAdd() {
        const element = document.createElement("div");
        element.className = "moto-rider-marker";
        element.setAttribute("aria-label", `Motociclista online: ${this.rider.name}`);
        this.element = element;
        this.render();
        element.addEventListener("click", () => onRiderSelect?.(this.rider));
        this.getPanes()?.overlayMouseTarget.appendChild(element);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection || !this.element) return;
        const point = projection.fromLatLngToDivPixel(
          new g.maps.LatLng(this.rider.lat, this.rider.lng),
        );
        if (!point) return;
        this.element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      }

      onRemove() {
        this.element?.remove();
        this.element = null;
      }

      update(rider: MapRider) {
        this.rider = rider;
        this.render();
        this.draw();
      }
    }

    const seen = new Set<string>();
    riders.forEach((r) => {
      seen.add(r.id);
      const existing = riderOverlaysRef.current.get(r.id);
      if (existing) {
        existing.update(r);
      } else {
        const overlay = new RiderAvatarOverlay(r);
        overlay.setMap(map);
        riderOverlaysRef.current.set(r.id, overlay);
      }
    });
    riderOverlaysRef.current.forEach((overlay, id) => {
      if (!seen.has(id)) {
        overlay.setMap(null);
        riderOverlaysRef.current.delete(id);
      }
    });
  }, [riders, onRiderSelect, state]);

  // Sync partner markers (premium gold badges with logo)
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map) return;
    const g = (window as unknown as { google: typeof google }).google;

    class PartnerOverlayImpl extends g.maps.OverlayView {
      private partner: MapPartner;
      private element: HTMLDivElement | null = null;

      constructor(partner: MapPartner) {
        super();
        this.partner = partner;
      }

      private render() {
        if (!this.element) return;
        const initials = (this.partner.name || "?").trim().charAt(0).toUpperCase();
        const logo = this.partner.logoUrl
          ? `<img src="${this.partner.logoUrl}" alt="" loading="lazy" />`
          : `<span class="moto-partner-marker__initial">${initials}</span>`;
        this.element.innerHTML = `
          <span class="moto-partner-marker__badge${this.partner.featured ? " is-featured" : ""}" title="${this.partner.name}">${logo}</span>
          <span class="moto-partner-marker__tag">${this.partner.benefit}</span>`;
      }

      onAdd() {
        const element = document.createElement("div");
        element.className = "moto-partner-marker";
        element.setAttribute("aria-label", `Parceiro: ${this.partner.name}`);
        this.element = element;
        this.render();
        element.addEventListener("click", () => onPartnerSelect?.(this.partner));
        this.getPanes()?.overlayMouseTarget.appendChild(element);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection || !this.element) return;
        const point = projection.fromLatLngToDivPixel(
          new g.maps.LatLng(this.partner.lat, this.partner.lng),
        );
        if (!point) return;
        this.element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      }

      onRemove() {
        this.element?.remove();
        this.element = null;
      }

      update(partner: MapPartner) {
        this.partner = partner;
        this.render();
        this.draw();
      }
    }

    const seen = new Set<string>();
    partners.forEach((p) => {
      seen.add(p.id);
      const existing = partnerOverlaysRef.current.get(p.id);
      if (existing) {
        existing.update(p);
      } else {
        const overlay = new PartnerOverlayImpl(p);
        overlay.setMap(map);
        partnerOverlaysRef.current.set(p.id, overlay);
      }
    });
    partnerOverlaysRef.current.forEach((overlay, id) => {
      if (!seen.has(id)) {
        overlay.setMap(null);
        partnerOverlaysRef.current.delete(id);
      }
    });
  }, [partners, onPartnerSelect, state]);

  // `cn` (tailwind-merge) resolve o conflito de posicionamento: quando o
  // chamador passa `absolute inset-0`, ele vence o `relative` padrão em vez de
  // ser silenciosamente ignorado pela ordem das classes no CSS gerado. Assim o
  // wrapper preenche a caixa já dimensionada do pai em vez de depender de
  // `h-full` resolver contra um ancestral que só tem `min-height`.
  // O container do mapa recebe posição e inset por estilo inline: o tamanho
  // que vai para o google.maps.Map não pode depender de ordem de classe
  // utilitária nem de porcentagem.
  return (
    <div className={cn("moto-map-surface relative h-full w-full", className)}>
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        className={cn(radius, (state === "error" || !apiKey) && "invisible")}
      />
      {state === "error" || !apiKey ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.10),#050505_70%)] px-6 text-center">
          {center ? (
            <>
              <p className="mt-16 text-[10px] uppercase tracking-widest text-gold">
                Você está aqui
              </p>
              <p className="font-mono text-xs text-foreground">
                {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
              </p>
              {accuracy != null && (
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  precisão ±{Math.round(accuracy)} m
                </p>
              )}
            </>
          ) : (
            <p className="text-xs uppercase tracking-widest text-gold">Localizando...</p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {!apiKey
              ? "Mapa visual indisponível — a chave do Google Maps ainda não foi configurada. Seu GPS continua ativo em tempo real."
              : "Mapa visual indisponível neste endereço: a chave do Google Maps não autoriza este domínio/app. Seu GPS continua ativo em tempo real."}
          </p>
          {apiKey && (
            <button
              type="button"
              onClick={() => {
                mapRef.current = null;
                setState("loading");
                setTentativa((t) => t + 1);
              }}
              className="rounded-full border border-gold/40 px-4 py-2 text-[11px] font-semibold text-gold"
            >
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              void abrirNavegacaoExterna(
                "google",
                center ? { latitude: center.lat, longitude: center.lng } : null,
              )
            }
            disabled={!center}
            className="rounded-full gold-gradient px-4 py-2 text-[11px] font-semibold text-black disabled:opacity-40"
          >
            Abrir no Google Maps
          </button>
        </div>
      ) : state !== "ready" ? (
        // Etiqueta, não cortina. O véu anterior cobria a área inteira com
        // preto 80% enquanto o estado não virasse "ready" — visualmente
        // idêntico ao defeito que estamos investigando.
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full border border-gold/30 bg-black/70 px-3 py-1.5 text-[10px] uppercase tracking-widest text-gold">
            {hasArea === false ? "Sem área para desenhar o mapa" : "Carregando mapa..."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
