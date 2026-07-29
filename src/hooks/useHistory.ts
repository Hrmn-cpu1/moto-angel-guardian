import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HistoryItem } from "@/types";

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  const reload = useCallback(async () => {
    const [trips, sos] = await Promise.all([
      supabase
        .from("trips")
        .select("id, started_at, ended_at, distance_km, duration_seconds, avg_speed, companion")
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("sos_events")
        .select("id, latitude, longitude, address, note, triggered_at")
        .order("triggered_at", { ascending: false })
        .limit(50),
    ]);

    const tripItems: HistoryItem[] = (trips.data ?? []).map((t) => ({
      id: `trip-${t.id}`,
      type: "trip",
      title: "Viagem concluída",
      description: `${Number(t.distance_km).toFixed(1)} km em ${formatDuration(Number(t.duration_seconds))}`,
      timestamp: t.ended_at ?? t.started_at,
      meta: {
        distance: Number(t.distance_km),
        duration: Number(t.duration_seconds),
        companion: t.companion ?? "",
      },
    }));

    const sosItems: HistoryItem[] = (sos.data ?? []).map((s) => ({
      id: `sos-${s.id}`,
      type: "sos",
      title: "Alerta SOS ativado",
      description:
        s.address ??
        (s.latitude != null && s.longitude != null
          ? `${Number(s.latitude).toFixed(5)}, ${Number(s.longitude).toFixed(5)}`
          : "Localização indisponível"),
      timestamp: s.triggered_at,
      meta: {
        lat: s.latitude != null ? Number(s.latitude) : "",
        lng: s.longitude != null ? Number(s.longitude) : "",
        note: s.note ?? "",
      },
    }));

    const merged = [...tripItems, ...sosItems].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    setItems(merged.slice(0, 50));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (item: Omit<HistoryItem, "id" | "timestamp">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (item.type === "trip") {
        const meta = item.meta ?? {};
        const duration = Number(meta.duration ?? 0);
        const distance = Number(meta.distance ?? 0);
        const now = new Date();
        const started = new Date(now.getTime() - duration * 1000);
        await supabase.from("trips").insert({
          user_id: user.id,
          started_at: started.toISOString(),
          ended_at: now.toISOString(),
          duration_seconds: duration,
          distance_km: distance,
          avg_speed: duration > 0 ? (distance / (duration / 3600)) : 0,
          companion: (meta.companion as string) || null,
        });
      } else if (item.type === "sos") {
        const meta = item.meta ?? {};
        await supabase.from("sos_events").insert({
          user_id: user.id,
          latitude: meta.lat === "" ? null : Number(meta.lat),
          longitude: meta.lng === "" ? null : Number(meta.lng),
          address: item.description,
          note: (meta.note as string) || null,
          status: "active",
        });
      }
      // "share" events are ephemeral; nothing to persist server-side.
      await reload();
    },
    [reload],
  );

  const clear = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await Promise.all([
      supabase.from("trips").delete().eq("user_id", user.id),
      supabase.from("sos_events").delete().eq("user_id", user.id),
    ]);
    setItems([]);
  }, []);

  return { items, add, clear };
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
