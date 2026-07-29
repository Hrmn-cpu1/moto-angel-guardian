import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  simulated: boolean;
}

const SIM: GeoPosition = {
  lat: -23.55052,
  lng: -46.633308,
  accuracy: 20,
  simulated: true,
};

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const capture = useCallback(async (): Promise<GeoPosition> => {
    setLoading(true);
    setError(null);
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setPosition(SIM);
        setLoading(false);
        resolve(SIM);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            simulated: false,
          };
          setPosition(p);
          setLoading(false);
          resolve(p);
        },
        (err) => {
          setError(err.message);
          setPosition(SIM);
          setLoading(false);
          resolve(SIM);
        },
        { enableHighAccuracy: true, timeout: 8000 },
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
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPosition(SIM);
      return;
    }
    if (watchIdRef.current != null) return;
    setWatching(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          simulated: false,
        });
        setError(null);
      },
      (err) => setError(err.message),
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

  return { position, loading, error, capture, share, startWatch, stopWatch, watching };
}