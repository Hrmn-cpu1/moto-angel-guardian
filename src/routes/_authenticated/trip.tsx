import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Rota histórica — hoje apenas um encaminhamento para a Home.
 *
 * Por que ela deixou de ter tela própria (RC7):
 *
 * Existiam DUAS Viagens Seguras no aplicativo. Esta rota tinha estado próprio
 * (`phase`, cronômetro, telemetria, seu próprio `watchPosition`) e não
 * conversava com `useTrip`, o serviço de primeiro plano do Android nem com a
 * trilha MA-TRIP. Consequência prática: uma pessoa podia estar "em viagem"
 * aqui sem nenhuma proteção nativa de pé, e o diagnóstico do crash ficava cego
 * a esse caminho. Este projeto já pagou esse preço uma vez com a camada de
 * riders — duas implementações da mesma coisa divergem.
 *
 * A viagem agora tem uma única fonte de verdade: `useTrip` + a Home/cockpit.
 * O link continua funcionando; quem chegar aqui (atalho antigo, histórico do
 * navegador, deep link) vai para o lugar onde a viagem realmente acontece.
 */
export const Route = createFileRoute("/_authenticated/trip")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
