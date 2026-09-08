import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { publicarPresenca } from "@/lib/presence";
import { assinarPosicao } from "@/lib/geo-watch";

/**
 * Compartilhamento contínuo de localização.
 *
 * RC2 hotfix P0.6-A: este hook NÃO escreve mais direto em `live_locations`.
 * A tabela perdeu INSERT/UPDATE/DELETE para `authenticated`, e toda escrita
 * passa por duas RPCs estreitas:
 *
 *   posição    -> presence_touch      (não toca em sharing)
 *   publicação -> set_location_sharing (não toca em lat/lng)
 *
 * Separar as duas é o ponto: antes, um upsert enviava posição e `sharing`
 * juntos, então qualquer caminho que atualizasse a posição podia mudar — de
 * propósito ou por descuido — a decisão de aparecer para os outros.
 *
 * A leitura da própria linha continua permitida pela RLS.
 */
export function useLiveShareRuntime() {
  const [sharing, setSharing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const changing = useRef(false);
  /** Cancelador da assinatura compartilhada de GPS. */
  const cancelarWatch = useRef<(() => void) | null>(null);
  const lastPush = useRef(0);
  const mounted = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    return () => {
      mounted.current = false;
      generation.current += 1;
      cancelarWatch.current?.();
      cancelarWatch.current = null;
    };
  }, []);

  // Restore the previous state so sharing survives navigation/reload.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data, error: readError } = await supabase
        .from("live_locations")
        .select("sharing,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (readError) setError("Não foi possível consultar o compartilhamento. Tente novamente.");
      setConfirmed(!readError);
      setSharing(!!data?.sharing);
      setLastSync(data?.updated_at ?? null);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setError("Não foi possível consultar o compartilhamento.");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const push = useCallback(async (coords: GeolocationCoordinates) => {
    if (!mounted.current) return;
    // Só posição. O estado de publicação já foi definido por set_location_sharing.
    const resultado = await publicarPresenca({
      lat: coords.latitude,
      lng: coords.longitude,
      speedKmh: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null,
      heading: coords.heading ?? null,
    });
    if (resultado.erro) {
      setError(resultado.erro);
      return;
    }
    // 'throttled' e 'rejected_jump' não são erro do usuário: o servidor
    // simplesmente não aceitou aquela amostra. A anterior continua valendo.
    if (resultado.status === "ok" || resultado.status === "created") {
      setLastSync(new Date().toISOString());
    }
  }, []);

  const stop = useCallback(async () => {
    if (changing.current) return;
    changing.current = true;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("set_location_sharing", { _enabled: false });
      if (err) throw err;
      cancelarWatch.current?.();
      cancelarWatch.current = null;
      setSharing(false);
      setConfirmed(true);
      setError(null);
    } catch {
      setError(
        "O servidor não confirmou a interrupção. Sua localização pode continuar compartilhada. Tente desligar novamente.",
      );
    } finally {
      changing.current = false;
      setSaving(false);
    }
  }, []);

  const subscribePosition = useCallback(() => {
    if (!mounted.current || cancelarWatch.current) return;
    cancelarWatch.current = assinarPosicao({
      aoReceber: (pos) => {
        const now = Date.now();
        if (now - lastPush.current < 10_000) return;
        lastPush.current = now;
        void push(pos.coords);
      },
      aoFalhar: (err) => setError(err.message),
    });
  }, [push]);

  const start = useCallback(async () => {
    if (!mounted.current || changing.current) return;
    const operation = generation.current;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS indisponível neste dispositivo.");
      return;
    }
    changing.current = true;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("set_location_sharing", { _enabled: true });
      if (!mounted.current || operation !== generation.current) return;
      if (err) throw err;
      setSharing(true);
      setConfirmed(true);
      setError(null);
      subscribePosition();
    } catch {
      setError("O servidor não confirmou o compartilhamento. Tente novamente.");
    } finally {
      changing.current = false;
      setSaving(false);
    }
  }, [subscribePosition]);

  const toggle = useCallback(() => {
    if (sharing || !confirmed) void stop();
    else void start();
  }, [sharing, confirmed, start, stop]);

  useEffect(() => {
    if (sharing && cancelarWatch.current == null) subscribePosition();
  }, [sharing, subscribePosition]);

  return { sharing, toggle, start, stop, lastSync, error, loading, saving, confirmed };
}

export const LiveShareContext = createContext<ReturnType<typeof useLiveShareRuntime> | null>(null);
export function useLiveShare() {
  const value = useContext(LiveShareContext);
  if (!value) throw new Error("Compartilhamento requer a sessão autenticada.");
  return value;
}
