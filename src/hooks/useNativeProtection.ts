import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { protectionOwner } from "@/lib/protection-session";
import { isNativeApp } from "@/lib/native";
import {
  cancelNativeAlert,
  configureNativeProtection,
  NO_NATIVE_PROTECTION,
  readNativeProtection,
  requestNativeSos,
  stopNativeProtection,
  type NativeProtectionState,
} from "@/lib/native-protection";

/** undefined means trip hydration is pending; null confirms there is no active trip. */
export function useNativeProtection(tripStartedAt: number | null | undefined) {
  const [state, setState] = useState<NativeProtectionState>(() =>
    isNativeApp() ? { ...NO_NATIVE_PROTECTION, supported: true } : NO_NATIVE_PROTECTION,
  );
  const [setupError, setSetupError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retrySetup = useCallback(() => setAttempt((value) => value + 1), []);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!isNativeApp()) return;
    let stopped = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await readNativeProtection();
        if (!stopped) {
          setState(next);
          setStatusError(null);
        }
      } catch {
        if (!stopped) {
          setState((previous) => ({ ...previous, supported: true, armed: false }));
          setStatusError("Não foi possível confirmar o estado da proteção no Android.");
        }
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 1000);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!isNativeApp() || tripStartedAt === undefined) return;
    let cancelled = false;
    const configure = async () => {
      try {
        if (tripStartedAt == null) {
          await stopNativeProtection();
        } else {
          const next = await configureNativeProtection(protectionOwner(), tripStartedAt);
          if (!cancelled) setState(next);
        }
        if (!cancelled) setSetupError(null);
      } catch {
        if (!cancelled)
          setSetupError(
            "Não foi possível preparar o SOS com a tela bloqueada. Confira a conexão e tente novamente.",
          );
      }
    };
    void configure();
    window.addEventListener("online", configure);
    return () => {
      cancelled = true;
      window.removeEventListener("online", configure);
    };
  }, [tripStartedAt, attempt]);
  const request = useCallback(async () => {
    try {
      const next = await requestNativeSos();
      if (mounted.current) setState(next);
    } catch {
      toast.error("Não foi possível iniciar o SOS nativo. Abra a tela SOS para conferir o pedido.");
    }
  }, []);
  const cancel = useCallback(async () => {
    try {
      const next = await cancelNativeAlert();
      if (mounted.current) {
        setState(next);
        if (!next.configured) setAttempt((value) => value + 1);
      }
    } catch {
      toast.error(
        "O cancelamento não foi confirmado. Conecte à internet e confira o SOS antes de tentar novamente.",
      );
    }
  }, []);
  return { state, setupError: setupError ?? statusError, request, cancel, retrySetup };
}
