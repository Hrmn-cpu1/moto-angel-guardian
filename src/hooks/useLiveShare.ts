import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Continuous location sharing: keeps a single live_locations row updated
 * while the switch is on, so contacts always see the latest position.
 */
export function useLiveShare() {
  const [sharing, setSharing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPush = useRef(0);

  // Restore the previous state so sharing survives navigation/reload.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("live_locations")
        .select("sharing,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setSharing(!!data.sharing);
      setLastSync(data.updated_at ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const push = useCallback(async (coords: GeolocationCoordinates, isSharing: boolean) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("live_locations").upsert(
      {
        user_id: user.id,
        lat: coords.latitude,
        lng: coords.longitude,
        speed_kmh: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null,
        heading: coords.heading ?? null,
        sharing: isSharing,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (err) setError(err.message);
    else {
      setError(null);
      setLastSync(new Date().toISOString());
    }
  }, []);

  const stop = useCallback(async () => {
    if (watchId.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("live_locations").update({ sharing: false }).eq("user_id", user.id);
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS indisponível neste dispositivo.");
      return;
    }
    if (watchId.current != null) return;
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        // throttle writes to one every 10s
        if (now - lastPush.current < 10_000) return;
        lastPush.current = now;
        void push(pos.coords, true);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [push]);

  const toggle = useCallback(() => {
    if (sharing) void stop();
    else start();
  }, [sharing, start, stop]);

  useEffect(() => {
    if (sharing && watchId.current == null) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  useEffect(() => {
    return () => {
      if (watchId.current != null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, []);

  return { sharing, toggle, start, stop, lastSync, error };
}
