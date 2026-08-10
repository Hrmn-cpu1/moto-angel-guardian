import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Contact as ContactIcon, Phone, Plus, Share2, Star, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { EmptyState } from "@/components/EmptyState";
import { useContacts } from "@/hooks/useContacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contatos de confiança — Moto Anjo" },
      { name: "description", content: "Gerencie contatos para acompanhamento e emergências." },
      { property: "og:title", content: "Contatos — Moto Anjo" },
      { property: "og:description", content: "Gerencie contatos de emergência." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const { contacts, add, remove, setPrimary } = useContacts();
  const { capture, share } = useGeolocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", relation: "" });

  const submit = () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    add({ ...form, isPrimary: contacts.length === 0 });
    setForm({ name: "", phone: "", relation: "" });
    setOpen(false);
  };

  const doShare = async (name: string, phone: string) => {
    const result = await capture();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const pos = result.position;
    const url = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    await share(
      `Olá ${name}, estou em ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}. Contato: ${phone}`,
      url,
    );
  };

  return (
    <AppShell>
      <Header
        back="/dashboard"
        title="Contatos"
        subtitle="De confiança"
        right={
          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full gold-gradient text-black"
            aria-label="Adicionar contato"
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="space-y-3 px-5 pt-4">
        {contacts.length === 0 ? (
          <EmptyState
            icon={ContactIcon}
            title="Nenhum contato ainda"
            description="Adicione pessoas de confiança para acompanhar suas viagens."
            action={
              <GoldButton size="sm" onClick={() => setOpen(true)}>
                Adicionar contato
              </GoldButton>
            }
          />
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="glass-card flex items-center gap-3 rounded-2xl p-4 animate-fade-up"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full gold-gradient text-black font-black">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                  {c.isPrimary && <Star size={12} className="text-gold" fill="currentColor" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.phone} · {c.relation}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconBtn onClick={() => setPrimary(c.id)} title="Definir principal">
                  <Star size={14} className={c.isPrimary ? "text-gold" : ""} />
                </IconBtn>
                <IconBtn onClick={() => doShare(c.name, c.phone)} title="Compartilhar">
                  <Share2 size={14} />
                </IconBtn>
                <IconBtn onClick={() => remove(c.id)} title="Remover">
                  <Trash2 size={14} />
                </IconBtn>
              </div>
            </div>
          ))
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-md rounded-t-3xl glass-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Novo contato</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <ModalField
                label="Nome"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <ModalField
                label="Telefone"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
                icon={<Phone size={14} />}
              />
              <ModalField
                label="Relação"
                value={form.relation}
                onChange={(v) => setForm({ ...form, relation: v })}
                placeholder="Ex.: Esposa, Amigo..."
              />
              <div className="grid grid-cols-2 gap-2 pt-2">
                <OutlineButton onClick={() => setOpen(false)}>Cancelar</OutlineButton>
                <GoldButton onClick={submit}>Salvar</GoldButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/20 text-gold transition hover:bg-gold/10"
    >
      {children}
    </button>
  );
}

function ModalField({
  label,
  value,
  onChange,
  icon,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
        {icon && <span className="text-gold">{icon}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-foreground outline-none"
        />
      </div>
    </label>
  );
}
