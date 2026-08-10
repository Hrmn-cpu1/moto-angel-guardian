import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  /** metres per second, when the device reports it */
  speed?: number | null;
  /** degrees clockwise from north, when the device reports it */
  heading?: number | null;
  /** epoch millis of the fix */
  timestamp: number;
  /** true quando o sistema marca a posição como vinda de um app de simulação */
  mocked?: boolean;
}

export type GeoErrorCode = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout";

export interface GeoError {
  code: GeoErrorCode;
  message: string;
}

/**
 * Resultado explícito de uma captura: ou veio posição, ou veio o motivo.
 * Substitui o antigo `null` mudo, que obrigava quem chamava a adivinhar se
 * faltou permissão, faltou sinal ou o aparelho nem tem GPS.
 */
export type GeoCaptureResult = { ok: true; position: GeoPosition } | { ok: false; error: GeoError };

const MESSAGES: Record<GeoErrorCode, string> = {
  unsupported: "Este dispositivo não oferece GPS ao navegador.",
  insecure: "A localização exige HTTPS. Abra o app pelo endereço seguro (https://).",
  denied: "Permissão de localização negada. Autorize o acesso nas configurações.",
  unavailable: "Não foi possível obter o sinal de GPS. Vá para um local aberto e tente de novo.",
  timeout: "O GPS demorou demais para responder. Tente novamente.",
};

function toGeoError(err: GeolocationPositionError): GeoError {
  if (err.code === err.PERMISSION_DENIED) return { code: "denied", message: MESSAGES.denied };
  if (err.code === err.TIMEOUT) return { code: "timeout", message: MESSAGES.timeout };
  return { code: "unavailable", message: MESSAGES.unavailable };
}

/**
 * O Capacitor e alguns WebViews Android expõem a flag de posição simulada.
 * Ela não faz parte do padrão W3C, por isso a leitura é defensiva: `undefined`
 * significa "o aparelho não sabe dizer", e não "é confiável".
 */
function readMockFlag(pos: GeolocationPosition): boolean | undefined {
  const c = pos.coords as GeolocationCoordinates & {
    mocked?: boolean;
    isFromMockProvider?: boolean;
  };
  const p = pos as GeolocationPosition & { mocked?: boolean };
  if (c.mocked === true || c.isFromMockProvider === true || p.mocked === true) return true;
  if (c.mocked === false || c.isFromMockProvider === false || p.mocked === false) return false;
  return undefined;
}

function toPosition(pos: GeolocationPosition): GeoPosition {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    speed: pos.coords.speed,
    heading: pos.coords.heading,
    timestamp: pos.timestamp,
    mocked: readMockFlag(pos),
  };
}

/** Reason the browser cannot serve a fix at all, or null when it can be attempted. */
function unavailableReason(): GeoError | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { code: "unsupported", message: MESSAGES.unsupported };
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { code: "insecure", message: MESSAGES.insecure };
  }
  return null;
}

/**
 * GPS real, e só.
 *
 * O hook nunca inventa coordenada. `capture()` devolve um resultado explícito:
 * `{ ok: true, position }` com timestamp e precisão, ou `{ ok: false, error }`
 * com o motivo. Quem chamou decide o que fazer — o SOS, por exemplo, recusa
 * fix antigo, impreciso ou simulado em vez de registrar posição que não serve.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GeoError | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const capture = useCallback(async (): Promise<GeoCaptureResult> => {
    const blocked = unavailableReason();
    if (blocked) {
      setError(blocked);
      setPosition(null);
      return { ok: false, error: blocked };
    }
    setLoading(true);
    setError(null);
    return new Promise<GeoCaptureResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = toPosition(pos);
          setPosition(p);
          setLoading(false);
          resolve({ ok: true, position: p });
        },
        (err) => {
          const geoError = toGeoError(err);
          setError(geoError);
          setPosition(null);
          setLoading(false);
          resolve({ ok: false, error: geoError });
        },
        // maximumAge: 0 obriga leitura nova — nada de fix reciclado num SOS.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }, []);

  const share = useCallback(async (text: string, url?: string) => {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: "Moto Anjo", text, url });
        return true;
      } catch {
        return false;
      }
    }
    if (nav.clipboard) {
      await nav.clipboard.writeText(`${text}${url ? ` ${url}` : ""}`);
      return true;
    }
    return false;
  }, []);

  const startWatch = useCallback(() => {
    const blocked = unavailableReason();
    if (blocked) {
      setError(blocked);
      return;
    }
    if (watchIdRef.current != null) return;
    setWatching(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(toPosition(pos));
        setError(null);
      },
      (err) => setError(toGeoError(err)),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setWatching(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {
    position,
    loading,
    error,
    errorMessage: error?.message ?? null,
    capture,
    share,
    startWatch,
    stopWatch,
    watching,
  };
}
