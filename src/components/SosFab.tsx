import { useNavigate } from "@tanstack/react-router";
import { SosHoldButton } from "@/components/SosHoldButton";
import { SosPanel } from "@/components/SosPanel";
import { useSosController } from "@/hooks/useSosController";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * Acionador flutuante ancorado acima da navegação inferior.
 *
 * Não recebe mais a posição pronta do painel: quem captura o GPS é o
 * `useSosController`, no instante do acionamento. A posição que estava na tela
 * podia ter minutos de idade — em uma emergência isso é o bairro errado.
 *
 * Também não publica nada na comunidade. A localização de quem acionou um SOS
 * vai para os contatos de emergência escolhidos pela pessoa, e só.
 */
export function SosFab({ className }: Props) {
  const sos = useSosController();
  const navigate = useNavigate();

  return (
    <>
      <SosHoldButton
        variant="fab"
        // Bloqueado enquanto o app ainda não sabe se já existe um SOS aberto.
        disabled={sos.busy || sos.recovering}
        onHoldComplete={(heldMs) => sos.trigger(heldMs)}
        className={cn(
          "fixed bottom-[calc(env(safe-area-inset-bottom)+66px)] left-1/2 z-50 -translate-x-1/2",
          className,
        )}
      />
      <SosPanel
        sos={sos}
        layout="overlay"
        onAddContacts={() => void navigate({ to: "/contacts" })}
      />
    </>
  );
}
