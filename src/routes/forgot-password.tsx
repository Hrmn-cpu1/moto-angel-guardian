import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Moto Anjo" },
      { name: "description", content: "Receba um link para redefinir sua senha do Moto Anjo." },
      { property: "og:title", content: "Recuperar senha — Moto Anjo" },
      { property: "og:description", content: "Receba um link para redefinir sua senha." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(value, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Never reveal whether the address exists.
    if (err && !err.message.toLowerCase().includes("user")) {
      setError("Não foi possível enviar agora. Tente novamente em instantes.");
      return;
    }
    setSent(true);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background px-4 pt-14 pb-6">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={88} withWordmark />
        <h1 className="mt-4 text-xl font-black uppercase tracking-tight text-foreground">
          Recuperar senha
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Enviaremos um link seguro para você criar uma nova senha.
        </p>
      </div>

      {sent ? (
        <div className="mt-5 space-y-4 animate-fade-up">
          <div className="glass-card flex items-start gap-3 rounded-2xl p-5">
            <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={18} />
            <p className="text-sm text-foreground">
              Se existir uma conta para <span className="text-gold">{email.trim()}</span>, o link de
              redefinição chegará em instantes. Verifique também o spam.
            </p>
          </div>
          <Link to="/login" search={{ next: undefined }}>
            <OutlineButton size="lg">Voltar para o login</OutlineButton>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4 animate-fade-up">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              E-mail
            </span>
            <span className="glass-card mt-2 flex items-center gap-3 rounded-xl px-4 py-3">
              <Mail size={16} className="text-gold" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                maxLength={255}
                placeholder="voce@motoanjo.com"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 px-3 py-2 text-xs text-emergency">
              <AlertCircle size={14} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <GoldButton size="lg" type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </GoldButton>
          <Link to="/login" search={{ next: undefined }} className="block">
            <OutlineButton type="button" size="lg">
              Voltar
            </OutlineButton>
          </Link>
        </form>
      )}
    </div>
  );
}
