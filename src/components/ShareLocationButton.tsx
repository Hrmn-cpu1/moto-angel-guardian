import { useState } from "react";
import { Share2, Copy, Check, Loader2 } from "lucide-react";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";

function buildMapsUrl(p: GeoPosition) {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}`;
}

export function ShareLocationButton() {
  const { capture, share } = useGeolocation();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function handleShare() {
    setLoading(true);
    setCopied(false);
    try {
      const pos = await capture();
      const url = buildMapsUrl(pos);
      setLink(url);
      const text = `Estou aqui agora — Moto Anjo. Minha localização em tempo real:`;
      const ok = await share(text, url);
      if (!ok && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!link || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            Localização em tempo real
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Envie um link atualizado para seus contatos de confiança.
          </p>
        </div>
        <button
          onClick={handleShare}
          disabled={loading}
          aria-label="Compartilhar minha localização"
          className="flex h-11 items-center gap-2 rounded-xl gold-gradient px-4 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_10px_30px_-12px_oklch(0.83_0.169_85/0.7)] transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          Compartilhar
        </button>
      </div>

      {link && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-gold/20 bg-black/40 p-2">
          <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {link}
          </span>
          <button
            onClick={handleCopy}
            aria-label="Copiar link"
            className="flex h-8 items-center gap-1 rounded-lg border border-gold/30 px-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition hover:bg-gold/10"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}
