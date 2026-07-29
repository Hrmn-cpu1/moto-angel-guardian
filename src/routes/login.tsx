import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/login")({
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
  const { login } = useAuth();
  const [email, setEmail] = useState("demo@motoanjo.com");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-6 pt-14 pb-10">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={64} />
        <h1 className="mt-5 text-2xl font-black tracking-tight text-foreground">Bem-vindo de volta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entre para continuar sua jornada.</p>
      </div>

      <form onSubmit={onSubmit} className="mt-10 space-y-4 animate-fade-up">
        <Field
          icon={<Mail size={16} />}
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="voce@motoanjo.com"
        />
        <Field
          icon={<Lock size={16} />}
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
        />

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
          <button
            type="button"
            className="text-muted-foreground hover:text-gold"
            onClick={() =>
              alert("Recuperação de senha indisponível na versão de demonstração.")
            }
          >
            Esqueci minha senha
          </button>
          <Link to="/register" className="font-semibold uppercase tracking-widest text-gold">
            Criar conta
          </Link>
        </div>
      </form>

      <div className="mt-auto pt-8 text-center text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
        Demonstração local
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <div className="glass-card flex items-center gap-3 rounded-xl px-4 py-3 focus-within:border-gold">
        <span className="text-gold">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          required
        />
      </div>
    </label>
  );
}