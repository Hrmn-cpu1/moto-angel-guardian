import { useCallback, useEffect, useRef, useState } from "react";

export interface RideTelemetry {
  /** current speed in km/h */
  speed: number;
  /** average speed of the session in km/h */
  average: number;
  /** highest speed of the session in km/h */
  max: number;
  /** distance travelled in km */
  distance: number;
  /** lean angle: negative = left, positive = right */
  lean: number;
  /** pitch angle: negative = nose down */
  pitch: number;
  motionAvailable: boolean;
  motionGranted: boolean;
  requestMotion: () => Promise<void>;
  reset: () => void;
}

function haversineKm(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Real-time speedometer (GPS) + gyroscope lean/pitch (device orientation).
 * Both signals degrade gracefully when the sensors are unavailable.
 */
export function useRideTelemetry(active = true): RideTelemetry {
  const [speed, setSpeed] = useState(0);
  const [max, setMax] = useState(0);
  const [distance, setDistance] = useState(0);
  const [samples, setSamples] = useState({ sum: 0, count: 0 });
  const [lean, setLean] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [motionGranted, setMotionGranted] = useState(false);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const lastCoords = useRef<GeolocationCoordinates | null>(null);
  const lastTime = useRef<number | null>(null);

  const reset = useCallback(() => {
    setSpeed(0);
    setMax(0);
    setDistance(0);
    setSamples({ sum: 0, count: 0 });
    lastCoords.current = null;
    lastTime.current = null;
  }, []);

  // GPS speedometer
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        let kmh = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : 0;
        if (lastCoords.current && lastTime.current) {
          const km = haversineKm(lastCoords.current, c);
          const hours = (pos.timestamp - lastTime.current) / 3_600_000;
          if (km > 0.002) setDistance((d) => d + km);
          if ((c.speed == null || c.speed < 0) && hours > 0) kmh = km / hours;
        }
        lastCoords.current = c;
        lastTime.current = pos.timestamp;
        const clamped = Math.min(299, Math.max(0, Math.round(kmh)));
        setSpeed(clamped);
        setMax((m) => (clamped > m ? clamped : m));
        setSamples((s) => ({ sum: s.sum + clamped, count: s.count + 1 }));
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  // Gyroscope / device orientation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "DeviceOrientationEvent" in window;
    setMotionAvailable(supported);
    if (!supported) return;
    const ctor = window.DeviceOrientationEvent as OrientationCtor;
    // iOS requires an explicit gesture-driven permission call.
    if (typeof ctor.requestPermission !== "function") setMotionGranted(true);
  }, []);

  useEffect(() => {
    if (!active || !motionGranted || typeof window === "undefined") return;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.gamma != null) setLean(Math.round(Math.max(-60, Math.min(60, e.gamma))));
      if (e.beta != null) setPitch(Math.round(Math.max(-60, Math.min(60, e.beta - 90))));
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [active, motionGranted]);

  const requestMotion = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ctor = window.DeviceOrientationEvent as OrientationCtor | undefined;
    if (!ctor) return;
    if (typeof ctor.requestPermission === "function") {
      try {
        const res = await ctor.requestPermission();
        setMotionGranted(res === "granted");
      } catch {
        setMotionGranted(false);
      }
    } else {
      setMotionGranted(true);
    }
  }, []);

  return {
    speed,
    average: samples.count ? Math.round(samples.sum / samples.count) : 0,
    max,
    distance,
    lean,
    pitch,
    motionAvailable,
    motionGranted,
    requestMotion,
    reset,
  };
}
