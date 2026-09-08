import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTrip } from "@/hooks/useTrip";
import { SosContext, useSosRuntime } from "@/hooks/useSosController";
import { LiveShareContext, useLiveShareRuntime } from "@/hooks/useLiveShare";
import { useCrashDetection } from "@/hooks/useCrashDetection";
import { ouvirSosDaTelaBloqueada } from "@/lib/trip-service";
import { registrarEventoDeViagem } from "@/lib/trip-diagnostics";
import { syncCompletedTrips } from "@/lib/trip-history-sync";
import { CrashAlert } from "./CrashAlert";
import { SosPanel } from "./SosPanel";

/** Mounted by the authenticated layout: navigation never tears protection down. */
export function ProtectionRuntime({ children }: { children: ReactNode }) {
  const { viagem } = useTrip();
  const viagemAtiva = viagem.estado === "ativa";
  const sos = useSosRuntime();
  const { recovering, trigger, holdMs } = sos;
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
    ativo: viagemAtiva,
    sosAtivo: sos.sosEventId != null || sos.busy || sos.recovering,
    aoAcionarSos: () => sos.trigger(sos.holdMs),
  });
  useEffect(() => {
    if (!viagemAtiva || recovering) return;
    return ouvirSosDaTelaBloqueada(() => {
      registrarEventoDeViagem("sos.lockscreen.request");
      trigger(holdMs);
    });
  }, [viagemAtiva, recovering, trigger, holdMs]);

  return (
    <SosContext.Provider value={sos}>
      <LiveShareContext.Provider value={sharing}>
        {children}
        <CrashAlert deteccao={deteccao} />
        {pathname !== "/sos" && (
          <SosPanel sos={sos} onAddContacts={() => void navigate({ to: "/contacts" })} />
        )}
      </LiveShareContext.Provider>
    </SosContext.Provider>
  );
}
