import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";

type OAuthClient = {
  authorization_id: string;
  client?: { name?: string; redirect_uri?: string };
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthClient | null; error: Error | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: Error | null;
  }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: Error | null;
  }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-foreground">
      <p className="text-sm text-emergency">
        Não foi possível carregar esta autorização: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "aplicativo externo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Nenhuma URL de retorno retornada.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-background px-6 py-10">
      <div className="glass-card w-full rounded-2xl p-6 text-center">
        <div className="mx-auto mb-4">
          <BrandMark size={56} />
        </div>
        <h1 className="text-xl font-black tracking-tight text-foreground">
          Conectar {clientName} ao Moto Anjo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Isso permite que {clientName} acesse ferramentas do Moto Anjo em seu nome (perfil,
          contatos e histórico). Suas políticas de acesso continuam valendo.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-emergency">
            {error}
          </p>
        )}
        <div className="mt-6 space-y-2">
          <GoldButton size="lg" disabled={busy} onClick={() => decide(true)}>
            {busy ? "Aguarde..." : "Aprovar"}
          </GoldButton>
          <OutlineButton disabled={busy} onClick={() => decide(false)}>
            Recusar
          </OutlineButton>
        </div>
      </div>
    </main>
  );
}
