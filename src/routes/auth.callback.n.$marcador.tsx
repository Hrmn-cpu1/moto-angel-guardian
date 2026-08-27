import { createFileRoute } from "@tanstack/react-router";
import { AuthCallbackScreen } from "@/components/AuthCallbackScreen";

/**
 * Retorno nativo do APK: `/auth/callback/n/ma1.<nonce>.<challenge>`.
 *
 * O marcador viaja no caminho porque o `state` pode não voltar intacto do
 * broker — e sem esse sinal a página tratava o retorno como navegador,
 * criando a sessão dentro do Custom Tab em vez de devolvê-la ao aplicativo.
 */
const META_CALLBACK = [
  { title: "Entrando — Moto Anjo" },
  { name: "description", content: "Concluindo o login no Moto Anjo." },
  { name: "robots", content: "noindex" },
  { property: "og:title", content: "Entrando — Moto Anjo" },
  { property: "og:description", content: "Concluindo o login no Moto Anjo." },
];

export const Route = createFileRoute("/auth/callback/n/$marcador")({
  ssr: false,
  head: () => ({ meta: META_CALLBACK }),
  component: RotaCallbackNativo,
});

function RotaCallbackNativo() {
  const { marcador } = Route.useParams();
  return <AuthCallbackScreen marcadorDaRota={marcador} />;
}
