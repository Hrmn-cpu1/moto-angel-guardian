import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { SosHoldButton } from "@/components/SosHoldButton";
import { SosPanel } from "@/components/SosPanel";
import { useSosController } from "@/hooks/useSosController";

export const Route = createFileRoute("/_authenticated/sos")({
  head: () => ({
    meta: [
      { title: "SOS — Moto Anjo" },
      { name: "description", content: "Acionamento de emergência com localização em tempo real." },
      { property: "og:title", content: "SOS — Moto Anjo" },
      {
        property: "og:description",
        content: "Acionamento de emergência com localização em tempo real.",
      },
    ],
  }),
  component: SOS,
});

/**
 * Tela dedicada de emergência.
 *
 * É o terceiro acionador do app e roda exatamente o mesmo fluxo do botão do
 * painel e do botão do mapa — o `useSosController` é a única implementação.
 * Um SOS acionado aqui aparece ao voltar para o mapa, e vice-versa, porque o
 * estado vem do banco e não da tela.
 */
function SOS() {
  const navigate = useNavigate();
  const sos = useSosController();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-black">
      <Header back="/dashboard" title="SOS" subtitle="Emergência" />

      <div className="flex flex-1 flex-col items-center gap-8 px-6 py-10">
        {sos.recovering && !sos.open ? (
          <p className="mt-16 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin text-gold" /> Verificando se você tem um
            alerta aberto...
          </p>
        ) : sos.open ? (
          <SosPanel
            sos={sos}
            layout="page"
            className="w-full animate-scale-in"
            onAddContacts={() => void navigate({ to: "/contacts" })}
          />
        ) : (
          <>
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-black uppercase tracking-tight text-emergency">
                ⚠ Emergência
              </h2>
              <p className="mt-2 text-sm text-foreground">Precisa de ajuda?</p>
              <p className="text-sm text-muted-foreground">
                Segure o botão por 3 segundos. O app pega sua posição na hora e prepara o aviso para
                os seus contatos.
              </p>
            </div>

            <SosHoldButton
              variant="page"
              disabled={sos.busy || sos.recovering}
              onHoldComplete={(heldMs) => sos.trigger(heldMs)}
            />

            <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
              O alerta vai para os contatos de emergência que você cadastrou. Sua localização não é
              publicada na comunidade.
            </p>
          </>
        )}
      </div>

      <p className="px-6 pb-8 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Em uma emergência com risco de vida, ligue também 190 / 193 / 192.
      </p>
    </div>
  );
}
