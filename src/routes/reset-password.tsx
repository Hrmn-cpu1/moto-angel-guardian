import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Moto Anjo" },
      { name: "description", content: "Defina uma nova senha para sua conta Moto Anjo." },
      { property: "og:title", content: "Nova senha — Moto Anjo" },
      { property: "og:description", content: "Defina uma nova senha para sua conta." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // The recovery link delivers a session (hash or code flow). Wait for it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background px-4 pt-14 pb-6">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={88} withWordmark />
        <h1 className="mt-4 text-xl font-black uppercase tracking-tight text-foreground">
          Nova senha
        </h1>
      </div>

      {!ready ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Abra esta página pelo link enviado ao seu e-mail para redefinir a senha.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4 animate-fade-up">
          <PasswordField label="Nova senha" value={password} onChange={setPassword} />
          <PasswordField label="Confirmar senha" value={confirm} onChange={setConfirm} />
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 px-3 py-2 text-xs text-emergency">
              <AlertCircle size={14} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <GoldButton size="lg" type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </GoldButton>
        </form>
      )}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span className="glass-card mt-2 flex items-center gap-3 rounded-xl px-4 py-3">
        <Lock size={16} className="text-gold" />
        <input
          type="password"
          autoComplete="new-password"
          value={value}
          maxLength={72}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </span>
    </label>
  );
}
