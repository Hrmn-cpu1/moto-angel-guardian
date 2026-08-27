import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NATIVE_CALLBACK_URL, parseAuthCallback } from "@/lib/native-auth";
import { registrarEventoDeAuth } from "@/lib/auth-diagnostics";
import { idDaTentativaDeAuth } from "@/lib/auth-diagnostics";
import { enviarBeaconDeCallback } from "@/lib/auth-beacon";
import { lerEstadoNativo } from "@/lib/oauth-state";
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
  // Chrome bloqueia navegação para esquema de aplicativo sem gesto do usuário.
  // Quando isso acontece o Custom Tab fica parado nesta página (barra com X,
  // domínio e três pontos) — e é assim que o retorno "some". Guardamos o
  // destino para oferecer um toque explícito, que o Chrome sempre honra.
  const [voltaManual, setVoltaManual] = useState<string | null>(null);


  useEffect(() => {
    const url = INITIAL_URL || window.location.href;
    const parsedUrl = new URL(url);
    const params = parsedUrl.searchParams;
    const hash = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
    const presenca = {
      state: params.has("state"),
      code: params.has("code"),
      error: params.has("error") || params.has("error_description"),
      sessao: hash.has("access_token") || hash.has("refresh_token"),
    };
    registrarEventoDeAuth("callback.web.enter");
    registrarEventoDeAuth("callback.web.query.presence", undefined, { flags: presenca });
    const state = params.get("state") ?? "";
    const estadoNativo = lerEstadoNativo(state);
    // O caminho novo reconhece o retorno nativo pelo próprio `state`; o
    // `native=1&cc=` fica como compatibilidade para um APK antigo que ainda
    // esteja instalado em algum aparelho de teste.
    const isNativeReturn = estadoNativo != null || /[?&]native=1(&|$|#)/.test(url);
    const parsed = parseAuthCallback(url);
    const beacon = (stage: "callback.web.enter" | "callback.native.detected" | "deepLink.begin") =>
      enviarBeaconDeCallback({
        attempt_id: idDaTentativaDeAuth(),
        stage,
        native_flow: isNativeReturn,
        has_state: presenca.state,
        has_code: presenca.code,
        has_error: presenca.error,
        has_session_params: presenca.sessao,
        ...(parsed.error ? { error_code: String(parsed.error).slice(0, 60) } : {}),
        origin_host: window.location.host,
        pathname: window.location.pathname,
      });
    beacon("callback.web.enter");

    if (isNativeReturn) {
      registrarEventoDeAuth("callback.native.detected");
      beacon("callback.native.detected");
      setMessage("Voltando para o Moto Anjo...");
      const challenge = estadoNativo?.challenge ?? params.get("cc") ?? "";
      const back = (extra: Record<string, string>) => {
        // `deepLink.begin` SEMPRE antes do replace: se o app nunca receber o
        // deep link, é esta marca que separa "callback não montou a volta" de
        // "Android não entregou o intent".
        registrarEventoDeAuth("deepLink.begin", undefined, {
          flags: { code: "code" in extra, error: "error" in extra, state: Boolean(state) },
        });
        beacon("deepLink.begin");
        window.location.replace(
          `${NATIVE_CALLBACK_URL}?${new URLSearchParams({ ...extra, ...(state ? { state } : {}) }).toString()}`,
        );
        registrarEventoDeAuth("deepLink.replace.called");
      };
      if (parsed.error) {
        back({ error: parsed.error });
        return;
      }
      if (!parsed.access_token || !parsed.refresh_token || !challenge) {
        back({ error: "Retorno do Google sem sessão." });
        return;
      }
      registrarEventoDeAuth("stash.begin");
      void stashNativeSession({
        data: {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          code_challenge: challenge,
        },
      })
        .then((res: { code: string }) => {
          registrarEventoDeAuth("stash.success");
          back({ code: res.code });
        })
        .catch((e: unknown) => {
          registrarEventoDeAuth("stash.fail", e instanceof Error ? e.name : "unknown");
          back({ error: e instanceof Error ? e.message : "Falha no login." });
        });
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
          registrarEventoDeAuth("dashboard.reached");
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
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <BrandMark size={72} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
