import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NATIVE_CALLBACK_URL, parseAuthCallback } from "@/lib/native-auth";
import { idDaTentativaDeAuth, registrarEventoDeAuth } from "@/lib/auth-diagnostics";
import { enviarBeaconDeCallback } from "@/lib/auth-beacon";
import { lerEstadoNativo, lerMarcadorNativo, montarEstadoNativo } from "@/lib/oauth-state";
import { stashNativeSession } from "@/lib/native-auth.functions";

/**
 * Retorno público do OAuth (Google) — web e APK.
 *
 * No navegador: o supabase-js detecta os tokens na URL e cria a sessão; aqui
 * só aguardamos. No APK a página abre no Custom Tab e NUNCA devolve tokens
 * pelo deep link: guarda a sessão no servidor e envia só um código opaco de
 * uso único (Authorization Code + PKCE).
 *
 * `marcadorDaRota` é o `ma1.<nonce>.<challenge>` que veio no CAMINHO do
 * redirect_uri. Ele é o sinal confiável de "este retorno é do aplicativo":
 * o `state` depende do broker devolver o valor intacto, o caminho não.
 *
 * A URL é capturada no import, antes de qualquer código tocar no supabase,
 * para que o `detectSessionInUrl` não limpe o hash antes de repassarmos.
 */
const INITIAL_URL = typeof window !== "undefined" ? window.location.href : "";

export function AuthCallbackScreen({ marcadorDaRota }: { marcadorDaRota?: string }) {
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
      marcador: Boolean(marcadorDaRota),
    };
    registrarEventoDeAuth("callback.web.enter");
    registrarEventoDeAuth("callback.web.query.presence", undefined, { flags: presenca });
    const stateRecebido = params.get("state") ?? "";
    const doMarcador = lerMarcadorNativo(marcadorDaRota);
    const doState = lerEstadoNativo(stateRecebido);
    const estadoNativo = doMarcador ?? doState;
    // Reconhecimento em três degraus, do mais confiável ao legado:
    // caminho -> state -> `native=1&cc=` (APK antigo ainda instalado).
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
      registrarEventoDeAuth("callback.native.detected", doMarcador ? "path" : "state");
      beacon("callback.native.detected");
      setMessage("Voltando para o Moto Anjo...");
      const challenge = estadoNativo?.challenge ?? params.get("cc") ?? "";
      // O deep link SEMPRE leva um `state` verificável: se o broker devolveu o
      // nosso, usamos ele; senão reconstruímos a partir do caminho. Sem isso a
      // validação anti-CSRF do app falharia fechada e o login morreria.
      const stateDeVolta =
        stateRecebido ||
        (estadoNativo ? montarEstadoNativo(estadoNativo.nonce, estadoNativo.challenge) : "");
      const back = (extra: Record<string, string>) => {
        // `deepLink.begin` SEMPRE antes do replace: se o app nunca receber o
        // deep link, é esta marca que separa "callback não montou a volta" de
        // "Android não entregou o intent".
        registrarEventoDeAuth("deepLink.begin", undefined, {
          flags: {
            code: "code" in extra,
            error: "error" in extra,
            state: Boolean(stateDeVolta),
          },
        });
        beacon("deepLink.begin");
        const alvo = `${NATIVE_CALLBACK_URL}?${new URLSearchParams({
          ...extra,
          ...(stateDeVolta ? { state: stateDeVolta } : {}),
        }).toString()}`;
        setVoltaManual(alvo);
        window.location.replace(alvo);

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
  }, [navigate, marcadorDaRota]);

  // O botão só aparece se, passado o tempo do redirecionamento automático, a
  // página ainda estiver viva — ou seja, o Chrome bloqueou o deep link.
  const [mostrarVolta, setMostrarVolta] = useState(false);
  useEffect(() => {
    if (!voltaManual) return;
    const t = window.setTimeout(() => setMostrarVolta(true), 1200);
    return () => window.clearTimeout(t);
  }, [voltaManual]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <BrandMark size={72} />
      <p className="text-sm text-muted-foreground">{message}</p>
      {mostrarVolta && voltaManual ? (
        <a
          href={voltaManual}
          className="rounded-full border border-gold/40 bg-gold/10 px-5 py-2 text-sm font-semibold text-gold"
          onClick={() => registrarEventoDeAuth("deepLink.replace.called", "manual")}
        >
          Voltar ao Moto Anjo
        </a>
      ) : null}
    </main>
  );
}
