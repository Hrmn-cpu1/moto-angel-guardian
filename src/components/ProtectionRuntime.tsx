import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTrip } from "@/hooks/useTrip";
import { SosContext, useSosRuntime } from "@/hooks/useSosController";
import { LiveShareContext, useLiveShareRuntime } from "@/hooks/useLiveShare";
import { useCrashDetection } from "@/hooks/useCrashDetection";
import { useNativeProtection } from "@/hooks/useNativeProtection";
import { reconcileNativeSos, reflectActiveSos } from "@/lib/native-protection";
import { ouvirSosDaTelaBloqueada } from "@/lib/trip-service";
import { registrarEventoDeViagem } from "@/lib/trip-diagnostics";
import { syncCompletedTrips } from "@/lib/trip-history-sync";
import { CrashAlert } from "./CrashAlert";
import { SosPanel } from "./SosPanel";

/** Mounted by the authenticated layout: navigation never tears protection down. */
export function ProtectionRuntime({ children }: { children: ReactNode }) {
  const { viagem, hydrated } = useTrip();
  const viagemAtiva = viagem.estado === "ativa";
  const sos = useSosRuntime();
  const native = useNativeProtection(
    hydrated ? (viagemAtiva ? viagem.iniciadaEm : null) : undefined,
  );
  const nativeState = native.state;
  const [dismissedNativeRequest, setDismissedNativeRequest] = useState<string | null>(null);
  const { recovering, trigger, holdMs, refresh: refreshSos, sosEventId } = sos;
  const sharing = useLiveShareRuntime();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const sync = () => {
      void syncCompletedTrips().catch(() => undefined);
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);
  const deteccao = useCrashDetection({
    ativo: hydrated && viagemAtiva && !nativeState.supported,
    sosAtivo: sos.sosEventId != null || sos.busy || sos.recovering,
    aoAcionarSos: () => sos.trigger(sos.holdMs),
  });
  useEffect(() => {
    if (!viagemAtiva || recovering || nativeState.configured) return;
    return ouvirSosDaTelaBloqueada(() => {
      registrarEventoDeViagem("sos.lockscreen.request");
      trigger(holdMs);
    });
  }, [viagemAtiva, recovering, trigger, holdMs, nativeState.configured]);
  useEffect(() => {
    const nativeId = nativeState.sosEventId;
    if (nativeState.phase !== "registered" || !nativeId || nativeId === sosEventId) return;
    let stopped = false;
    let inFlight = false;
    let attempts = 0;
    const reconcile = async () => {
      if (stopped || inFlight || attempts >= 6) return;
      inFlight = true;
      attempts += 1;
      refreshSos();
      try {
        await reconcileNativeSos(nativeId);
      } catch {
        /* Retain the native request until the server confirms its state. */
      } finally {
        inFlight = false;
      }
    };
    const resume = () => {
      attempts = 0;
      void reconcile();
    };
    void reconcile();
    const interval = window.setInterval(() => {
      void reconcile();
    }, 5000);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [nativeState.phase, nativeState.sosEventId, sosEventId, refreshSos]);
  useEffect(() => {
    const refresh = sos.refresh;
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [sos.refresh]);
  useEffect(() => {
    if (!nativeState.supported || recovering) return;
    void reflectActiveSos(sos.sosEventId).catch(() => undefined);
  }, [nativeState.supported, recovering, sos.sosEventId]);
  const nativePending =
    Boolean(nativeState.requestId) &&
    !sos.sosEventId &&
    (nativeState.phase === "failed" || nativeState.phase === "registering");
  const nativeUnsynced =
    nativeState.phase === "registered" && Boolean(nativeState.sosEventId) && !sos.sosEventId;
  const nativeFallback = nativePending || nativeUnsynced;
  const nativePanelId = nativeState.requestId ?? nativeState.sosEventId ?? null;
  const retryNative = () => {
    if (nativeUnsynced && nativeState.sosEventId) {
      refreshSos();
      void reconcileNativeSos(nativeState.sosEventId).catch(() => undefined);
    } else if (!nativeState.configured || nativeState.needsReconfiguration) native.retrySetup();
    else void native.request();
  };
  const sharedSos =
    nativeState.configured || nativeFallback
      ? {
          ...sos,
          ...(nativeFallback
            ? {
                open: sos.open || dismissedNativeRequest !== nativePanelId,
                phase: nativeUnsynced
                  ? ("aguardando_envio" as const)
                  : nativeState.phase === "registering"
                    ? ("registrando" as const)
                    : ("falha_registro" as const),
                phaseLabel: nativeUnsynced
                  ? "SOS registrado; aguardando sincronização"
                  : nativeState.phase === "registering"
                    ? "Registrando SOS no Android"
                    : "SOS sem confirmação do servidor",
                errorMessage: nativeUnsynced
                  ? "O Android confirmou o registro. Ainda estamos consultando o estado dos avisos; nenhum envio foi confirmado nesta tela."
                  : nativeState.phase === "registering"
                    ? null
                    : `${nativeState.error || "O registro ainda não foi confirmado."} Você pode avisar seus contatos pelo WhatsApp abaixo ou ligar 190, 192 ou 193.`,
                requestId: nativeState.requestId ?? null,
                sosEventId: nativeUnsynced ? (nativeState.sosEventId ?? null) : sos.sosEventId,
                cancel: () => {
                  void native.cancel();
                },
                closePanel: () => {
                  setDismissedNativeRequest(nativePanelId);
                  sos.closePanel();
                },
              }
            : {}),
          busy: sos.busy || nativeState.phase === "registering",
          retry: retryNative,
          trigger: (heldMs = 0) => {
            if (heldMs < holdMs || sos.busy || recovering) return;
            setDismissedNativeRequest(null);
            if (sos.sosEventId) trigger(heldMs);
            else if (nativeUnsynced) retryNative();
            else void native.request();
          },
        }
      : sos;
  const nativeAlert = {
    ...deteccao,
    estado: nativeState.phase === "countdown" ? ("countdown" as const) : ("normal" as const),
    segundos: Math.max(
      0,
      Math.ceil(((nativeState.countdownEndsAt ?? Date.now()) - Date.now()) / 1000),
    ),
    cancelar: () => {
      void native.cancel();
    },
    confirmar: () => {
      void native.request();
    },
  };

  return (
    <SosContext.Provider value={sharedSos}>
      <LiveShareContext.Provider value={sharing}>
        {children}
        <CrashAlert
          deteccao={nativeState.supported ? nativeAlert : deteccao}
          diagnostic={nativeState.diagnostic}
        />
        {viagemAtiva &&
          nativeState.supported &&
          (native.setupError ||
            !nativeState.configured ||
            !nativeState.armed ||
            nativeState.phase === "failed" ||
            nativeState.phase === "registering") &&
          nativeState.phase !== "countdown" && (
            <div
              role="status"
              className="fixed inset-x-3 bottom-20 z-[80] mx-auto max-w-md rounded-xl border border-gold/40 bg-background p-3 text-xs text-foreground shadow-lg"
            >
              <p>
                {nativeState.phase === "registering"
                  ? "Registrando SOS no Android… Aguarde a confirmação."
                  : nativeState.phase === "failed"
                    ? nativeState.error ||
                      "SOS pendente no aparelho. Confira a conexão e tente novamente."
                    : native.setupError ||
                      "Proteção automática limitada. Confira a conexão, o GPS e a permissão de notificações do Android."}
              </p>
              {nativeState.phase !== "registering" && (
                <button
                  className="mt-2 font-bold text-gold"
                  onClick={nativeState.phase === "failed" ? retryNative : native.retrySetup}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}
        {pathname !== "/sos" && (
          <SosPanel sos={sharedSos} onAddContacts={() => void navigate({ to: "/contacts" })} />
        )}
      </LiveShareContext.Provider>
    </SosContext.Provider>
  );
}
