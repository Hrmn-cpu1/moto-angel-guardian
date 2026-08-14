import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";
import poster from "@/assets/moto-anjo-hero.png.asset.json";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Bem-vindo — Moto Anjo" },
      {
        name: "description",
        content: "Sua jornada mais segura começa aqui. Entre ou crie sua conta Moto Anjo.",
      },
      { property: "og:title", content: "Bem-vindo — Moto Anjo" },
      {
        property: "og:description",
        content: "Sua jornada mais segura começa aqui.",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden bg-background">
      <img
        src={poster.url}
        alt=""
        aria-hidden="true"
        width={895}
        height={930}
        className="absolute inset-x-0 bottom-0 h-[62%] w-full object-cover object-bottom opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/85 to-black/95" />
      <div className="relative z-10 flex flex-1 flex-col justify-between px-4 pt-14 pb-8">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <BrandMark size={88} withWordmark />
        </div>

        <div className="space-y-4 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="space-y-3 text-center">
            <h1 className="ma-hero font-black leading-tight text-foreground">
              Porque o mais importante <br />
              <span className="gold-text">é voltar para casa.</span>
            </h1>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
              O Moto Anjo cuida de você na estrada com tecnologia, comunidade e assistência{" "}
              <span className="gold-text font-semibold">24 horas</span>.
            </p>
          </div>
          <div className="space-y-3">
            <Link to="/login" search={{ next: undefined }} className="block">
              <GoldButton size="lg" className="animate-gold-glow">
                Entrar <ArrowRight size={18} />
              </GoldButton>
            </Link>
            <Link to="/register" search={{ next: undefined }} className="block">
              <OutlineButton size="lg">Criar conta</OutlineButton>
            </Link>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Versão Premium <BadgeCheck size={14} className="text-gold" />
          </p>
        </div>
      </div>
    </div>
  );
}
