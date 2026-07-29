/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import type { POI } from "@/lib/pois.functions";

// Premium dark style with gold accents
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c8c8c" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#161616" }] },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#1f1a10" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2a1f0a" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#D4AF37" }, { weight: 0.3 }],
  },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#666" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050505" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
];

type LoaderState = "idle" | "loading" | "ready" | "error";

let loaderPromise: Promise<typeof google> | null = null;

function loadGoogleMaps(apiKey: string, channel?: string): Promise<typeof google> {
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

function pinSvg(color: string, glyphColor: string, glyph: "you" | POI["type"]): string {
  const paths: Record<string, string> = {
    hospital: '<path d="M12 8v8M8 12h8" stroke="' + glyphColor + '" stroke-width="2.4" stroke-linecap="round"/>',
    fuel: '<path d="M10 8h4v9h-4z M14 11h2v4a1 1 0 001 1" stroke="' + glyphColor + '" stroke-width="1.5" fill="none"/>',
    shop: '<path d="M9 15l6-6M11 9h4v4" stroke="' + glyphColor + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    anjo: '<path d="M12 8l2 3 3 .4-2.2 2.1.5 3-2.3-1.3-2.3 1.3.5-3L9 11.4l3-.4z" fill="' + glyphColor + '"/>',
    you: '<circle cx="12" cy="12" r="4" fill="' + glyphColor + '"/>',
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
  pois?: POI[];
  onPoiSelect?: (poi: POI) => void;
  interactive?: boolean;
  className?: string;
}

export default function RealMap({
  center,
  pois = [],
  onPoiSelect,
  interactive = true,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const poiMarkersRef = useRef<google.maps.Marker[]>([]);
  const [state, setState] = useState<LoaderState>("idle");

  const apiKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
    | string
    | undefined;

  const fallbackCenter = useMemo(() => center ?? { lat: -23.55052, lng: -46.633308 }, [center]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    setState("loading");
    let cancelled = false;
    loadGoogleMaps(apiKey, channel)
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: fallbackCenter,
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: interactive ? "greedy" : "none",
          zoomControl: interactive,
          keyboardShortcuts: false,
          clickableIcons: false,
          backgroundColor: "#050505",
          styles: DARK_STYLE,
        });
        mapRef.current = map;
        setState("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, channel, fallbackCenter, interactive]);

  // Update user marker + recenter when center changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const g = (window as unknown as { google: typeof google }).google;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new g.maps.Marker({
        map,
        position: center,
        icon: {
          url: pinSvg("#D4AF37", "#050505", "you"),
          scaledSize: new g.maps.Size(34, 42),
          anchor: new g.maps.Point(17, 42),
        },
        zIndex: 999,
      });
    } else {
      userMarkerRef.current.setPosition(center);
    }
    map.panTo(center);
  }, [center]);

  // Sync POI markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
  }, [pois, onPoiSelect]);

  if (!apiKey) {
    return (
      <div className={`flex items-center justify-center bg-black text-center text-xs text-muted-foreground ${className ?? ""}`}>
        Mapa indisponível — chave do Google Maps não configurada.
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0 rounded-3xl" />
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-black/80 text-xs uppercase tracking-widest text-gold">
          {state === "error" ? "Erro ao carregar mapa" : "Carregando mapa..."}
        </div>
      )}
    </div>
  );
}