import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/register")({
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
  const { register } = useAuth();
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
    if (form.password.length < 6) return setError("Senha precisa ter no mínimo 6 caracteres.");
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
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
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
        <TxtField label="Nome completo" value={form.name} onChange={set("name")} required />
        <TxtField label="E-mail" type="email" value={form.email} onChange={set("email")} required />
        <TxtField label="Telefone" value={form.phone} onChange={set("phone")} required />
        <div className="grid grid-cols-2 gap-3">
          <TxtField label="Senha" type="password" value={form.password} onChange={set("password")} required />
          <TxtField label="Confirmar" type="password" value={form.confirm} onChange={set("confirm")} required />
        </div>
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