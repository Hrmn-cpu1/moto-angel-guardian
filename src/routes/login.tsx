import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Moto Anjo" },
      { name: "description", content: "Acesse sua conta Moto Anjo." },
      { property: "og:title", content: "Entrar — Moto Anjo" },
      { property: "og:description", content: "Acesse sua conta Moto Anjo." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();
  const { next } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    if (next && next.startsWith("/")) {
      window.location.href = next;
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    setError(null);
    try {
      await loginWithGoogle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login com Google.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-6 pt-14 pb-10">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={64} />
        <h1 className="mt-5 text-2xl font-black tracking-tight text-foreground">Bem-vindo de volta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entre para continuar sua jornada.</p>
      </div>

      <div className="mt-8 space-y-3 animate-fade-up">
        <button
          type="button"
          onClick={googleSignIn}
          className="glass-card flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-foreground transition hover:border-gold"
        >
          <GoogleG /> Continuar com Google
        </button>
        <div className="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-2 space-y-4 animate-fade-up">
        <Field icon={<Mail size={16} />} label="E-mail" type="email" value={email} onChange={setEmail} placeholder="voce@motoanjo.com" />
        <Field icon={<Lock size={16} />} label="Senha" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 px-3 py-2 text-xs text-emergency">
            <AlertCircle size={14} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2">
          <GoldButton size="lg" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </GoldButton>
        </div>

        <div className="flex items-center justify-between pt-2 text-xs">
          <span className="text-muted-foreground">Novo por aqui?</span>
          <Link to="/register" search={{ next }} className="font-semibold uppercase tracking-widest text-gold">
            Criar conta
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ icon, label, type, value, onChange, placeholder }: {
  icon: React.ReactNode; label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      <div className="glass-card flex items-center gap-3 rounded-xl px-4 py-3 focus-within:border-gold">
        <span className="text-gold">{icon}</span>
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60" required />
      </div>
    </label>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.9 0 7.4 1.4 10.2 3.7l7.6-7.6C37.4 1.5 31.1-1 24 -1 14.6-1 6.5 4.4 2.7 12.3l8.9 6.9C13.4 13.1 18.2 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.3-10.1 7.3-17.6z"/>
      <path fill="#FBBC05" d="M11.6 28.8c-.5-1.4-.8-2.9-.8-4.3s.3-2.9.8-4.3l-8.9-6.9C1 16.7 0 20.2 0 24s1 7.3 2.7 10.7l8.9-5.9z"/>
      <path fill="#34A853" d="M24 47c6.5 0 12-2.1 16-5.8l-7.6-5.9c-2.1 1.4-4.8 2.2-8.4 2.2-5.8 0-10.6-3.9-12.4-9.1l-8.9 5.9C6.5 41.6 14.6 47 24 47z"/>
    </svg>
  );
}
