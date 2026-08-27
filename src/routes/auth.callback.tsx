import { createFileRoute } from "@tanstack/react-router";
import { AuthCallbackScreen, META_CALLBACK } from "@/components/AuthCallbackScreen";

/** Retorno web (e retorno nativo legado, reconhecido pelo `state`). */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({ meta: META_CALLBACK }),
  component: () => <AuthCallbackScreen />,
});
