import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Moto Anjo — Segurança e SOS para motociclistas" },
      {
        name: "description",
        content:
          "Moto Anjo: SOS com localização, mapa em tempo real, contatos de emergência e comunidade para motociclistas.",
      },
      { property: "og:title", content: "Moto Anjo — Segurança e SOS para motociclistas" },
      {
        property: "og:description",
        content: "SOS com localização, mapa em tempo real e comunidade para motociclistas.",
      },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // Honor a saved intent from Google OAuth redirect.
      let next: string | null = null;
      try {
        next = sessionStorage.getItem("moto_anjo_next");
        if (next) sessionStorage.removeItem("moto_anjo_next");
      } catch {
        /* ignore */
      }
      if (data.session?.user) {
        navigate({ to: next && next.startsWith("/") ? next : "/dashboard" });
      } else {
        navigate({ to: "/welcome" });
      }
    }, 1600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, oklch(0.78 0.13 84 / 0.18), transparent 55%)",
        }}
      />
      <div className="animate-scale-in">
        <BrandMark size={104} />
      </div>
      <h1 className="mt-8 text-4xl font-black tracking-[0.32em] gold-text animate-fade-up">
        MOTO ANJO
      </h1>
      <div className="mt-3 h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent" />
      <p
        className="mt-4 text-sm font-medium tracking-widest text-muted-foreground animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        Proteção em cada caminho.
      </p>
      <div className="absolute bottom-10 flex flex-col items-center gap-3">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full gold-gradient"
            style={{ animation: "shimmer 2s linear infinite", width: "40%" }}
          />
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Inicializando escudo
        </p>
      </div>
    </div>
  );
}
