import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { useAuth } from "@/hooks/useAuth";
import { destinoInternoSeguro, nextInternoOuIndefinido } from "@/lib/redirect-seguro";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: nextInternoOuIndefinido(s.next),
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
  const [confirmSent, setConfirmSent] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatPlate = (v: string) => {
    return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
  };

  const pwdChecks = useMemo(() => {
    const p = form.password;
    const common = [
      "123456",
      "12345678",
      "123456789",
      "password",
      "senha",
      "qwerty",
      "111111",
      "abc123",
      "iloveyou",
      "admin",
      "motoanjo",
    ];
    return [
      { key: "len", label: "Mínimo 8 caracteres", ok: p.length >= 8 },
      { key: "upper", label: "Uma letra maiúscula", ok: /[A-Z]/.test(p) },
      { key: "lower", label: "Uma letra minúscula", ok: /[a-z]/.test(p) },
      { key: "num", label: "Um número", ok: /[0-9]/.test(p) },
      { key: "sym", label: "Um símbolo (!@#$...)", ok: /[^A-Za-z0-9]/.test(p) },
      {
        key: "common",
        label: "Não é uma senha comum",
        ok: p.length > 0 && !common.some((c) => p.toLowerCase().includes(c)),
      },
    ];
  }, [form.password]);
  const pwdScore = pwdChecks.filter((c) => c.ok).length;
  const pwdStrong = pwdScore === pwdChecks.length;
  const pwdMatch = form.confirm.length > 0 && form.password === form.confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError("Por favor, preencha seu nome completo.");
    if (!form.email.trim()) return setError("Por favor, informe seu e-mail.");
    if (!form.phone.trim()) return setError("Por favor, informe seu telefone.");
    if (!pwdStrong) return setError("Sua senha não atende a todos os requisitos de segurança.");
    if (form.password !== form.confirm) return setError("As senhas não coincidem.");
    if (!accepted) return setError("Você precisa aceitar os Termos de Uso e a Política de Privacidade.");
    setLoading(true);
    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        bikeModel: form.bikeModel.trim(),
        plate: form.plate.trim(),
        bloodType: form.bloodType.trim(),
        emergencyContact: form.emergencyContact.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      });
      if (result.status === "confirm_email") {
        setConfirmSent(true);
        return;
      }
      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    // Open redirect: "//evil.com" também começa com "/".
    if (next) window.location.href = destinoInternoSeguro(next);
    else navigate({ to: "/dashboard" });
  };

  const googleSignIn = async () => {
    setError(null);
    try {
      await loginWithGoogle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login com Google.");
    }
  };

  if (confirmSent) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <BrandMark size={72} withWordmark />
        <h1 className="text-xl font-black tracking-tight text-foreground">Confirme seu e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de confirmação para <span className="gold-text">{form.email}</span>. Abra
          o link e depois volte para entrar. Sua conta só é liberada após a confirmação.
        </p>
        <Link to="/login" search={{ next }} className="w-full pt-2">
          <OutlineButton type="button" size="lg">
            Ir para o login
          </OutlineButton>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background px-4 pt-6 pb-6">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={64} withWordmark />
        <h1 className="mt-4 ma-title font-black tracking-tight text-foreground">Criar conta</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Um por todos. <span className="gold-text">Todos por um.</span>
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3 animate-fade-up">
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
        <TxtField label="Nome completo" value={form.name} onChange={set("name")} required placeholder="Ex: João da Silva" />
        <TxtField label="E-mail" type="email" value={form.email} onChange={set("email")} required placeholder="seu@email.com" />
        <TxtField
          label="Telefone"
          type="tel"
          value={form.phone}
          onChange={(v) => set("phone")(formatPhone(v))}
          placeholder="(11) 99999-9999"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <TxtField
            label="Senha"
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="Crie sua senha"
            required
          />
          <TxtField
            label="Confirmar"
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            placeholder="Repita a senha"
            required
          />
        </div>
        <PasswordStrength checks={pwdChecks} score={pwdScore} total={pwdChecks.length} />
        {form.confirm.length > 0 && (
          <div
            className={`flex items-center gap-2 text-[11px] ${pwdMatch ? "text-gold" : "text-emergency"}`}
          >
            {pwdMatch ? <Check size={12} /> : <X size={12} />}
            {pwdMatch ? "As senhas coincidem." : "As senhas não coincidem."}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TxtField
            label="Modelo da moto"
            value={form.bikeModel}
            onChange={set("bikeModel")}
            placeholder="Ex: Honda CG 160"
          />
          <TxtField
            label="Placa"
            value={form.plate}
            onChange={(v) => set("plate")(formatPlate(v))}
            placeholder="ABC1D23"
          />
        </div>
        <SelectField
          label="Tipo sanguíneo"
          value={form.bloodType}
          onChange={set("bloodType")}
          options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
          placeholder="Selecione o tipo sanguíneo..."
        />
        <TxtField
          label="Contato de emergência"
          value={form.emergencyContact}
          onChange={set("emergencyContact")}
          placeholder="Nome de quem avisar"
        />
        <TxtField
          label="Telefone de emergência"
          type="tel"
          value={form.emergencyPhone}
          onChange={(v) => set("emergencyPhone")(formatPhone(v))}
          placeholder="(11) 99999-9999"
        />

        <label className="flex items-start gap-3 pt-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[color:oklch(0.83_0.169_85)]"
          />
          <span>
            Li e aceito os{" "}
            <Link
              to="/terms"
              search={{ accept: false }}
              className="font-semibold text-gold underline"
            >
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
          <GoldButton
            size="lg"
            type="submit"
            disabled={loading}
          >
            {loading ? "Criando..." : "Criar conta"}
          </GoldButton>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Já tem uma conta?{" "}
          <Link to="/login" search={{ next: undefined }} className="font-semibold text-gold">
            Entrar
          </Link>
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

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <div className="glass-card rounded-xl px-4 py-2.5 focus-within:border-gold">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none cursor-pointer [&>option]:bg-background [&>option]:text-foreground"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.9 0 7.4 1.4 10.2 3.7l7.6-7.6C37.4 1.5 31.1-1 24 -1 14.6-1 6.5 4.4 2.7 12.3l8.9 6.9C13.4 13.1 18.2 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.3-10.1 7.3-17.6z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28.8c-.5-1.4-.8-2.9-.8-4.3s.3-2.9.8-4.3l-8.9-6.9C1 16.7 0 20.2 0 24s1 7.3 2.7 10.7l8.9-5.9z"
      />
      <path
        fill="#34A853"
        d="M24 47c6.5 0 12-2.1 16-5.8l-7.6-5.9c-2.1 1.4-4.8 2.2-8.4 2.2-5.8 0-10.6-3.9-12.4-9.1l-8.9 5.9C6.5 41.6 14.6 47 24 47z"
      />
    </svg>
  );
}

function PasswordStrength({
  checks,
  score,
  total,
}: {
  checks: { key: string; label: string; ok: boolean }[];
  score: number;
  total: number;
}) {
  const pct = (score / total) * 100;
  const label = score <= 2 ? "Fraca" : score <= 4 ? "Média" : score === total ? "Forte" : "Boa";
  const color = score <= 2 ? "bg-emergency" : score < total ? "bg-gold/70" : "bg-gold";
  return (
    <div className="-mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/50">
          <div
            className={`h-full ${color} transition-all duration-300`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li
            key={c.key}
            className={`flex items-center gap-1.5 text-[10px] ${c.ok ? "text-gold" : "text-muted-foreground"}`}
          >
            {c.ok ? <Check size={11} /> : <X size={11} className="opacity-60" />}
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
