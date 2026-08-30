import { useNavigate } from "@tanstack/react-router";
import { SosHoldButton } from "@/components/SosHoldButton";
import { SosPanel } from "@/components/SosPanel";
import { useSosController } from "@/hooks/useSosController";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  compact?: boolean;
  /**
   * Esconde o acionador flutuante. Usado quando uma folha inferior ou o
   * teclado ocupam a mesma região: o SOS não pode interceptar o toque
   * destinado ao campo de destino ou ao CTA do painel. O painel de SOS ativo
   * continua renderizado — emergência em curso nunca é escondida.
   */
  oculto?: boolean;
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
/**
 * Versão que RECEBE o controlador.
 *
 * BUG REAL (RC3.2): a Home já chamava `useSosController()` para saber se
 * existe SOS aberto, e o `SosFab` chamava de novo. Dois controladores = dois
 * canais de tempo real com o mesmo nome e duas recuperações concorrentes do
 * mesmo evento. Quem tem o estado passa o estado.
 */
export function SosFabControlado({
  sos,
  className,
  compact = false,
  oculto = false,
}: Props & { sos: ReturnType<typeof useSosController> }) {
  const navigate = useNavigate();

  return (
    <>
      {!oculto && (
        <SosHoldButton
          variant={compact ? "compact" : "fab"}
          // Bloqueado enquanto o app ainda não sabe se já existe um SOS aberto.
          disabled={sos.busy || sos.recovering}
          onHoldComplete={(heldMs) => sos.trigger(heldMs)}
          className={cn(
            "fixed bottom-[calc(var(--ma-bottom)+6px)] left-1/2 z-50 -translate-x-1/2",
            className,
          )}
        />
      )}
      <SosPanel
        sos={sos}
        layout="overlay"
        onAddContacts={() => void navigate({ to: "/contacts" })}
      />
    </>
  );
}

/** Versão autônoma, para telas que não precisam do estado do SOS. */
export function SosFab(props: Props) {
  const sos = useSosController();
  return <SosFabControlado sos={sos} {...props} />;
}
