import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Copy, Radio, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLiveShare } from "@/hooks/useLiveShare";
import { useContacts } from "@/hooks/useContacts";

export const Route = createFileRoute("/_authenticated/sharing")({
  head: () => ({
    meta: [
      { title: "Compartilhar Localização — Moto Anjo" },
      {
        name: "description",
        content: "Compartilhe sua localização em tempo real com seus contatos de confiança.",
      },
      { property: "og:title", content: "Compartilhar Localização — Moto Anjo" },
      {
        property: "og:description",
        content: "Compartilhe sua localização em tempo real com seus contatos de confiança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharingPage,
});

function SharingPage() {
  const { position, capture, share } = useGeolocation();
  const { sharing, toggle, lastSync, error } = useLiveShare();
  const { contacts } = useContacts();

  useEffect(() => {
    void capture();
  }, [capture]);

  const link = position ? `https://www.google.com/maps?q=${position.lat},${position.lng}` : "";

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado.");
  };

  const sendWhats = (phone: string, name: string) => {
    if (!link) {
      toast.error("Localização indisponível.");
      return;
    }
    const msg = `🏍️ MOTO ANJO — Estou compartilhando minha localização com você, ${name}.\n📍 ${link}`;
    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <AppShell>
      <Header back="/dashboard" title="Compartilhar" subtitle="Localização em tempo real" />

      <div className="space-y-4 px-5 pt-4">
        <div className="glass-card rounded-xl p-5 text-center animate-fade-up">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${
              sharing
                ? "border-gold bg-gold/15 text-gold animate-pulse"
                : "border-gold/20 text-muted-foreground"
            }`}
          >
            <Radio size={26} />
          </div>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
            {sharing ? "Transmitindo posição" : "Compartilhamento desligado"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sharing
              ? "Sua posição é atualizada automaticamente a cada 10 segundos."
              : "Ative para manter seus contatos acompanhando o trajeto."}
          </p>
          {position && (
            <p className="mt-3 rounded-lg border border-gold/15 bg-black/40 py-2 font-mono text-xs text-gold">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </p>
          )}
          {lastSync && (
            <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Última sincronização:{" "}
              {new Date(lastSync).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          {error && <p className="mt-2 text-[11px] text-emergency">{error}</p>}
          <div className="mt-4 space-y-2">
            <GoldButton onClick={toggle}>
              {sharing ? "Parar compartilhamento" : "Iniciar compartilhamento"}
            </GoldButton>
            <div className="grid grid-cols-2 gap-2">
              <OutlineButton
                size="sm"
                onClick={() => void share("Minha localização — Moto Anjo", link)}
                disabled={!link}
              >
                <Share2 size={14} /> Enviar
              </OutlineButton>
              <OutlineButton size="sm" onClick={copy} disabled={!link}>
                <Copy size={14} /> Copiar link
              </OutlineButton>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            <Users size={13} /> Contatos de confiança
          </p>
          <div className="mt-3 space-y-2">
            {contacts.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Nenhum contato cadastrado ainda.
              </p>
            )}
            {contacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-gold/15 bg-black/40 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.phone}</p>
                </div>
                <button
                  onClick={() => sendWhats(c.phone, c.name)}
                  className="shrink-0 rounded-lg border border-gold/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/10"
                >
                  Enviar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}