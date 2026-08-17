import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/ui/GoldButton";
import { diagnosticoDeAuthExportavel, limparTrilhaDeAuth } from "@/lib/auth-diagnostics";

/**
 * Tela de diagnóstico do login (RC7.1).
 *
 * A trilha MA-AUTH só existia no localStorage do aparelho — para lê-la era
 * preciso Android Studio. Aqui a pessoa copia o mesmo conteúdo com um toque.
 * O texto exportado é o JSON sanitizado: nomes de etapa, flags booleanas,
 * host/rota e códigos de erro. Nunca token, código, verifier ou e-mail.
 */
export const Route = createFileRoute("/oauth-debug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Diagnóstico de login — Moto Anjo" },
      { name: "description", content: "Copie a trilha técnica da última tentativa de login." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Diagnóstico de login — Moto Anjo" },
      { property: "og:description", content: "Trilha técnica da última tentativa de login." },
    ],
  }),
  component: OAuthDebug,
});

function OAuthDebug() {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");

  const atualizar = useCallback(() => setTexto(diagnosticoDeAuthExportavel()), []);
  useEffect(atualizar, [atualizar]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Diagnóstico copiado.");
    } catch {
      setAviso("Não foi possível copiar automaticamente — selecione o texto abaixo.");
    }
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col gap-4 bg-background px-4 py-8">
      <header className="flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <h1 className="text-base font-semibold text-foreground">Diagnóstico OAuth</h1>
          <p className="text-xs text-muted-foreground">
            Trilha da última tentativa de login. Sem dados sensíveis.
          </p>
        </div>
      </header>

      <GoldButton onClick={copiar}>Copiar diagnóstico OAuth</GoldButton>
      {aviso ? <p className="text-xs text-muted-foreground">{aviso}</p> : null}

      <textarea
        readOnly
        value={texto}
        aria-label="Diagnóstico OAuth"
        className="min-h-[45dvh] w-full rounded-xl border border-border bg-card p-3 font-mono text-[11px] text-foreground"
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            limparTrilhaDeAuth();
            atualizar();
            setAviso("Trilha apagada.");
          }}
          className="text-xs text-muted-foreground underline"
        >
          Apagar trilha
        </button>
        <Link to="/login" search={{ next: undefined }} className="text-xs text-muted-foreground underline">
          Voltar ao login
        </Link>
      </div>
    </main>
  );
}
