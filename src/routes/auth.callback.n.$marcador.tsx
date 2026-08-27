import { createFileRoute } from "@tanstack/react-router";
import { AuthCallbackScreen, META_CALLBACK } from "@/components/AuthCallbackScreen";

/**
 * Retorno nativo do APK: `/auth/callback/n/ma1.<nonce>.<challenge>`.
 *
 * O marcador viaja no caminho porque o `state` pode não voltar intacto do
 * broker — e sem esse sinal a página tratava o retorno como navegador,
 * criando a sessão dentro do Custom Tab em vez de devolvê-la ao aplicativo.
 */
export const Route = createFileRoute("/auth/callback/n/$marcador")({
  ssr: false,
  head: () => ({ meta: META_CALLBACK }),
  component: RotaCallbackNativo,
});

function RotaCallbackNativo() {
  const { marcador } = Route.useParams();
  return <AuthCallbackScreen marcadorDaRota={marcador} />;
}
