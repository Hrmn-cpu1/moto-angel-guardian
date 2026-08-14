import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShieldPlus, Users, MapPin, ShieldCheck, Clock } from "lucide-react";
import poster from "@/assets/moto-anjo-hero.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { isIntroHidden } from "@/lib/intro";
import { bootstrapNativeAuth, getNativeAuthSnapshot } from "@/lib/native-auth";

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
      await bootstrapNativeAuth();
      if (getNativeAuthSnapshot().processing) return;
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
        navigate({ to: isIntroHidden() ? "/welcome" : "/intro" });
      }
    }, 2600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [navigate]);

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-background">
      <img
        src={poster.url}
        alt="Moto Anjo — um por todos, todos por um"
        width={895}
        height={930}
        className="absolute inset-x-0 top-0 h-[70%] w-full object-cover object-top animate-scale-in"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black" />

      <div className="relative z-10 mt-auto w-full px-5 pb-8 text-center animate-fade-up">
        <h1 className="text-base font-black uppercase tracking-[0.14em] text-foreground">
          Um por todos. Todos por um.
        </h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] gold-text">
          Porque o mais importante é voltar para casa.
        </p>

        <div className="mt-4 grid grid-cols-5 gap-1">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1.5">
              <f.icon size={20} className={f.red ? "text-emergency" : "text-gold"} />
              <span className="text-[7px] font-semibold uppercase leading-tight tracking-wide text-foreground/80">
                {f.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light animate-splash-progress" />
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] gold-text">
          Carregando...
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: ShieldPlus, label: "Proteção em tempo real", red: true },
  { icon: Users, label: "Comunidade unida", red: false },
  { icon: MapPin, label: "Alerta automático", red: true },
  { icon: ShieldCheck, label: "Segurança na rotina", red: false },
  { icon: Clock, label: "Assistência 24 horas", red: false },
];
