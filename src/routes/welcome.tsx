import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { GoldButton } from "@/components/GoldButton";
import { OutlineButton } from "@/components/OutlineButton";

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
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col overflow-hidden bg-background">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=1080&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
      <div className="relative z-10 flex flex-1 flex-col justify-between px-6 pt-16 pb-10">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <BrandMark size={72} />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.36em] text-gold">
            Moto Anjo
          </p>
        </div>
        <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="space-y-3">
            <h1 className="text-3xl font-black leading-tight text-foreground">
              Sua jornada mais segura <span className="gold-text">começa aqui.</span>
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Proteção, localização e comunidade para quem vive sobre duas rodas.
            </p>
          </div>
          <div className="space-y-3">
            <Link to="/login" search={{ next: undefined }} className="block">
              <GoldButton size="lg">Entrar</GoldButton>
            </Link>
            <Link to="/register" search={{ next: undefined }} className="block">
              <OutlineButton size="lg">Criar conta</OutlineButton>
            </Link>
          </div>
          <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            Demonstração • demo@motoanjo.com • 123456
          </p>
        </div>
      </div>
    </div>
  );
}
