import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Criar conta — Moto Anjo" },
      { name: "description", content: "Crie sua conta Moto Anjo em poucos passos." },
      { property: "og:title", content: "Criar conta — Moto Anjo" },
      { property: "og:description", content: "Crie sua conta Moto Anjo em poucos passos." },
    ],
  }),
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const { register, loginWithGoogle } = useAuth();
  const { next } = useSearch({ from: "/register" });
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    bikeModel: "",
    plate: "",
    bloodType: "",
    emergencyContact: "",
    emergencyPhone: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError("Senha precisa ter no mínimo 8 caracteres.");
    if (form.password !== form.confirm) return setError("As senhas não coincidem.");
    if (!accepted) return setError("Você precisa aceitar os termos.");
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        bikeModel: form.bikeModel,
        plate: form.plate,
        bloodType: form.bloodType,
        emergencyContact: form.emergencyContact,
        emergencyPhone: form.emergencyPhone,
      });
      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    if (next && next.startsWith("/")) {
      window.location.href = next;
    } else {
      navigate({ to: "/dashboard" });
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-6 pt-10 pb-10">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={56} />
        <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">Criar conta</h1>
        <p className="mt-1 text-xs text-muted-foreground">Junte-se à comunidade Moto Anjo.</p>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-3 animate-fade-up">
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
        <TxtField label="Nome completo" value={form.name} onChange={set("name")} required />
        <TxtField label="E-mail" type="email" value={form.email} onChange={set("email")} required />
        <TxtField label="Telefone" value={form.phone} onChange={set("phone")} required />
        <div className="grid grid-cols-2 gap-3">
          <TxtField label="Senha" type="password" value={form.password} onChange={set("password")} required />
          <TxtField label="Confirmar" type="password" value={form.confirm} onChange={set("confirm")} required />
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          Mínimo 8 caracteres. Evite senhas comuns (ex.: 123456, senha, qwerty). Use letras, números e símbolos.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <TxtField label="Modelo da moto" value={form.bikeModel} onChange={set("bikeModel")} />
          <TxtField label="Placa" value={form.plate} onChange={set("plate")} />
        </div>
        <TxtField label="Tipo sanguíneo" value={form.bloodType} onChange={set("bloodType")} placeholder="O+, A-, ..." />
        <TxtField label="Contato de emergência" value={form.emergencyContact} onChange={set("emergencyContact")} />
        <TxtField label="Telefone de emergência" value={form.emergencyPhone} onChange={set("emergencyPhone")} />

        <label className="flex items-start gap-3 pt-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[color:oklch(0.78_0.13_84)]"
          />
          <span>
            Li e aceito os{" "}
            <Link to="/terms" className="font-semibold text-gold underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link to="/privacy" className="font-semibold text-gold underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency/10 px-3 py-2 text-xs text-emergency">
            <AlertCircle size={14} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-3">
          <GoldButton size="lg" type="submit" disabled={loading || !accepted}>
            {loading ? "Criando..." : "Criar conta"}
          </GoldButton>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Já tem uma conta?{" "}
          <Link to="/login" className="font-semibold text-gold">Entrar</Link>
        </p>
      </form>
    </div>
  );
}

function TxtField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <div className="glass-card rounded-xl px-4 py-2.5 focus-within:border-gold">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
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
