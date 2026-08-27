import { createFileRoute } from "@tanstack/react-router";
import { AuthCallbackScreen } from "@/components/AuthCallbackScreen";

/** Retorno web (e retorno nativo legado, reconhecido pelo `state`). */
const META_CALLBACK = [
  { title: "Entrando — Moto Anjo" },
  { name: "description", content: "Concluindo o login no Moto Anjo." },
  { name: "robots", content: "noindex" },
  { property: "og:title", content: "Entrando — Moto Anjo" },
  { property: "og:description", content: "Concluindo o login no Moto Anjo." },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary" },
];

export const Route = createFileRoute("/auth/callback/")({
  ssr: false,
  head: () => ({ meta: META_CALLBACK }),
  component: () => <AuthCallbackScreen />,
});