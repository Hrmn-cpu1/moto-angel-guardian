import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NATIVE_CALLBACK_URL, parseAuthCallback } from "@/lib/native-auth";
import { stashNativeSession } from "@/lib/native-auth.functions";

/**
 * Retorno público do OAuth (Google).
 *
 * No navegador: o supabase-js já detecta os tokens na URL e cria a sessão;
 * aqui só aguardamos e seguimos. No APK: a página abre dentro do Custom Tab e
 * NUNCA devolve tokens pelo deep link — guarda a sessão no servidor e envia
 * apenas um código opaco de uso único (Authorization Code + PKCE).
 *
 * A URL é capturada no import, antes de qualquer código tocar no supabase,
 * para que o `detectSessionInUrl` não limpe o hash antes de repassarmos.
 */
const INITIAL_URL = typeof window !== "undefined" ? window.location.href : "";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrando — Moto Anjo" },
      { name: "description", content: "Concluindo o login no Moto Anjo." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Entrando — Moto Anjo" },
      { property: "og:description", content: "Concluindo o login no Moto Anjo." },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Concluindo seu login...");

  useEffect(() => {
    const url = INITIAL_URL || window.location.href;
    const isNativeReturn = /[?&]native=1(&|$|#)/.test(url);
    const parsed = parseAuthCallback(url);

    if (isNativeReturn) {
      setMessage("Voltando para o Moto Anjo...");
      const challenge = new URL(url).searchParams.get("cc") ?? "";
      const back = (params: Record<string, string>) =>
        window.location.replace(`${NATIVE_CALLBACK_URL}?${new URLSearchParams(params).toString()}`);
      if (parsed.error) {
        back({ error: parsed.error });
        return;
      }
      if (!parsed.access_token || !parsed.refresh_token || !challenge) {
        back({ error: "Retorno do Google sem sessão." });
        return;
      }
      void stashNativeSession({
        data: {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          code_challenge: challenge,
        },
      })
        .then((res: { code: string }) => back({ code: res.code }))
        .catch((e: unknown) => back({ error: e instanceof Error ? e.message : "Falha no login." }));
      return;
    }

    if (parsed.error) {
      setMessage(parsed.error);
      return;
    }

    // Navegador: o cliente Supabase consome os tokens da URL sozinho.
    let cancelled = false;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      for (let i = 0; i < 20 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          navigate({ to: "/dashboard" });
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) navigate({ to: "/login", search: { next: undefined } });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <BrandMark size={72} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
