import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Check, Copy, Radio, Share2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLiveShare } from "@/hooks/useLiveShare";
import { useContacts } from "@/hooks/useContacts";
import { useLocationShares } from "@/hooks/useLocationShares";
import { useRiderVisibility } from "@/hooks/useRiderVisibility";

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
  const { pending, approved, approve, revoke, requestAccess, requesting } = useLocationShares();
  const riders = useRiderVisibility();

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
    // Pela ponte: `window.open` direto podia levar a WebView principal para o
    // redirecionamento do wa.me e derrubar a tela do app.
    void abrirUrlExterna(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
    );
  };

  const askAccess = async (phone: string, name: string) => {
    try {
      const result = await requestAccess(phone);
      if (result === "requested") toast.success(`Pedido enviado para ${name}.`);
      else if (result === "not_a_contact") toast.error("Salve o contato antes de pedir acesso.");
      else if (result === "no_account") toast.error(`${name} ainda não tem conta no Moto Anjo.`);
      else toast.error("Telefone inválido.");
    } catch {
      toast.error("Não foi possível enviar o pedido.");
    }
  };

  return (
    <AppShell>
      <Header back="/dashboard" title="Compartilhar" subtitle="Localização em tempo real" />

      <div className="space-y-4 px-5 pt-4">
        <div className="glass-card rounded-xl p-5 text-center animate-fade-up">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
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

          {/* RC2 checkpoint C — opt-in explícito e reversível. */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">
                  Aparecer para outros motoqueiros
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {riders.visivel
                    ? "Motociclistas próximos veem seu primeiro nome e sua posição enquanto o compartilhamento estiver ligado."
                    : "Hoje só seus contatos autorizados enxergam você. Ligue para aparecer também para motociclistas próximos."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={riders.visivel}
                aria-label="Aparecer para outros motoqueiros"
                disabled={riders.carregando || riders.salvando}
                onClick={() => void riders.alternar()}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  riders.visivel ? "border-gold/60 bg-gold/30" : "border-white/15 bg-white/5"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
                    riders.visivel ? "left-6 bg-gold" : "left-0.5 bg-muted-foreground"
                  }`}
                />
              </button>
            </div>
            {riders.erro && <p className="mt-2 text-[11px] text-emergency">{riders.erro}</p>}
          </div>
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
            <ShieldCheck size={13} /> Quem pode ver sua posição
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Somente pessoas aprovadas por você acompanham sua localização ao vivo.
          </p>
          <div className="mt-3 space-y-2">
            {pending.length === 0 && approved.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Nenhuma autorização ativa.
              </p>
            )}
            {pending.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/25 bg-black/40 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{g.viewer_name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-gold">Pedido pendente</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    aria-label={`Aprovar ${g.viewer_name}`}
                    onClick={() => void approve(g.id)}
                    className="rounded-lg border border-gold/40 p-2 text-gold transition hover:bg-gold/10"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    aria-label={`Recusar ${g.viewer_name}`}
                    onClick={() => void revoke(g.id)}
                    className="rounded-lg border border-emergency/40 p-2 text-emergency transition hover:bg-emergency/10"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
            {approved.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/15 bg-black/40 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{g.viewer_name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Autorizado
                  </p>
                </div>
                <button
                  onClick={() => void revoke(g.id)}
                  className="shrink-0 rounded-lg border border-emergency/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emergency transition hover:bg-emergency/10"
                >
                  Revogar
                </button>
              </div>
            ))}
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
                <button
                  disabled={requesting}
                  onClick={() => void askAccess(c.phone, c.name)}
                  className="ml-2 flex shrink-0 items-center gap-1 rounded-lg border border-gold/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-gold/10 hover:text-gold disabled:opacity-50"
                >
                  <UserPlus size={12} /> Acesso
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
