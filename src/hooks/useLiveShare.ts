import { useCallback, useEffect, useRef, useState } from "react";
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
export function useLiveShare() {
  const [sharing, setSharing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cancelador da assinatura compartilhada de GPS. */
  const cancelarWatch = useRef<(() => void) | null>(null);
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

  const push = useCallback(async (coords: GeolocationCoordinates) => {
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
    setError(null);
    // 'throttled' e 'rejected_jump' não são erro do usuário: o servidor
    // simplesmente não aceitou aquela amostra. A anterior continua valendo.
    if (resultado.status === "ok" || resultado.status === "created") {
      setLastSync(new Date().toISOString());
    }
  }, []);

  const stop = useCallback(async () => {
    cancelarWatch.current?.();
    cancelarWatch.current = null;
    setSharing(false);
    const { error: err } = await supabase.rpc("set_location_sharing", { _enabled: false });
    if (err) setError(err.message);
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS indisponível neste dispositivo.");
      return;
    }
    if (cancelarWatch.current) return;
    setSharing(true);
    // Liga a publicação antes de mandar posição: a ordem importa, porque
    // presence_touch nunca liga sharing sozinho.
    void supabase
      .rpc("set_location_sharing", { _enabled: true })
      .then(({ error: err }) => {
        if (err) setError(err.message);
      });
    // Reutiliza a posição compartilhada em vez de abrir um segundo watcher.
    cancelarWatch.current = assinarPosicao({
      aoReceber: (pos) => {
        const now = Date.now();
        // throttle writes to one every 10s
        if (now - lastPush.current < 10_000) return;
        lastPush.current = now;
        void push(pos.coords);
      },
      aoFalhar: (err) => setError(err.message),
    });
  }, [push]);

  const toggle = useCallback(() => {
    if (sharing) void stop();
    else start();
  }, [sharing, start, stop]);

  useEffect(() => {
    if (sharing && cancelarWatch.current == null) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  useEffect(() => {
    return () => {
      cancelarWatch.current?.();
      cancelarWatch.current = null;
    };
  }, []);

  return { sharing, toggle, start, stop, lastSync, error };
}
