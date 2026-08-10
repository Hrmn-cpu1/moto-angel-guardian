import { useNavigate } from "@tanstack/react-router";
import { SosHoldButton } from "@/components/SosHoldButton";
import { SosPanel } from "@/components/SosPanel";
import { useSosController } from "@/hooks/useSosController";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * Acionador fixado sobre o mapa.
 *
 * Antes ele reaproveitava as coordenadas que o mapa já tinha e exigia só 2
 * segundos de pressão — dois comportamentos diferentes dos outros acionadores.
 * Agora usa o mesmo `useSosController`: mesma pressão de 3 s, mesmo GPS novo,
 * mesmas recusas de fix antigo, impreciso ou simulado, mesmo registro único.
 */
export function MapSosButton({ className }: Props) {
  const sos = useSosController();
  const navigate = useNavigate();

  return (
    <>
      <SosHoldButton
        variant="map"
        // Bloqueado enquanto o app ainda não sabe se já existe um SOS aberto.
        disabled={sos.busy || sos.recovering}
        onHoldComplete={(heldMs) => sos.trigger(heldMs)}
        className={cn("absolute bottom-4 right-4 z-20", className)}
      />
      <SosPanel
        sos={sos}
        layout="inline"
        onAddContacts={() => void navigate({ to: "/contacts" })}
      />
    </>
  );
}
