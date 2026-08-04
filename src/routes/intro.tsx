import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, HeartHandshake, ShieldPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { setIntroHidden } from "@/lib/intro";
import poster from "@/assets/moto-anjo-hero.png.asset.json";

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: "Bem-vindo ao Moto Anjo — Proteção para motoboys" },
      {
        name: "description",
        content:
          "Proteção, família e irmandade: o Moto Anjo existe para aumentar as chances de você voltar para casa em segurança.",
      },
      { property: "og:title", content: "Bem-vindo ao Moto Anjo" },
      {
        property: "og:description",
        content: "Porque quem espera você em casa merece ver você voltar.",
      },
    ],
  }),
  component: IntroPage,
});

interface Block {
  icon: LucideIcon;
  title: string;
  lines: string[];
  accent?: boolean;
}

const BLOCKS: Block[] = [
  {
    icon: ShieldPlus,
    title: "Proteção",
    lines: [
      "Monitoramento durante suas viagens.",
      "Botão SOS.",
      "Compartilhamento de localização.",
      "Alertas inteligentes.",
    ],
    accent: true,
  },
  {
    icon: Users,
    title: "Família",
    lines: [
      "Compartilhe sua localização.",
      "Avise seus contatos.",
      "Mais tranquilidade para quem espera você.",
    ],
  },
  {
    icon: HeartHandshake,
    title: "Irmandade",
    lines: ["Comunidade Moto Anjo.", "Ajuda entre motociclistas.", "Rede de apoio em tempo real."],
  },
];

function IntroPage() {
  const navigate = useNavigate();
  const [dontShow, setDontShow] = useState(false);

  const onContinue = () => {
    setIntroHidden(dontShow);
    navigate({ to: "/welcome" });
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col overflow-hidden bg-background">
      <img
        src={poster.url}
        alt=""
        aria-hidden="true"
        width={895}
        height={930}
        className="pointer-events-none absolute inset-x-0 top-0 h-[46%] w-full object-cover object-top opacity-25"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/90 to-black" />

      <div className="relative z-10 flex flex-1 flex-col px-6 pt-12 pb-10">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <BrandMark size={78} withWordmark />
          <h1 className="mt-6 text-2xl font-black leading-tight text-foreground">
            Bem-vindo ao <span className="gold-text">Moto Anjo</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Este aplicativo foi desenvolvido pensando 100% na segurança do motoboy.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Nossa missão é simples: aumentar as chances de que você volte para casa em segurança
            todos os dias.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Porque cada corrida importa. E quem espera você em casa merece ver você voltar.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {BLOCKS.map((b, i) => (
            <article
              key={b.title}
              className="glass-card rounded-2xl p-5 animate-fade-up"
              style={{ animationDelay: `${0.1 + i * 0.1}s` }}
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    b.accent
                      ? "flex h-11 w-11 items-center justify-center rounded-xl border border-emergency/40 bg-emergency/10 text-emergency"
                      : "flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold"
                  }
                >
                  <b.icon size={20} />
                </span>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                  {b.title}
                </h2>
              </div>
              <ul className="mt-3 space-y-1.5">
                {b.lines.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-base font-bold italic leading-snug gold-text animate-fade-up">
          “Porque quem espera você em casa merece ver você voltar.”
        </p>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            role="checkbox"
            aria-checked={dontShow}
            onClick={() => setDontShow((v) => !v)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span
              className={
                dontShow
                  ? "flex h-5 w-5 items-center justify-center rounded-md border border-gold bg-gold text-black"
                  : "flex h-5 w-5 items-center justify-center rounded-md border border-gold/40"
              }
            >
              {dontShow && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="text-xs text-muted-foreground">Não mostrar esta tela novamente</span>
          </button>

          <GoldButton size="lg" onClick={onContinue} className="animate-gold-glow">
            Continuar <ArrowRight size={18} />
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
