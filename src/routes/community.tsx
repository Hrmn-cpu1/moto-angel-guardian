import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, MessageCircle, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SOSFab } from "@/components/SOSFab";
import { GoldButton } from "@/components/GoldButton";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Comunidade — Moto Anjo" },
      { name: "description", content: "Dicas, alertas e histórias de quem vive sobre duas rodas." },
      { property: "og:title", content: "Comunidade — Moto Anjo" },
      { property: "og:description", content: "Dicas, alertas e histórias." },
    ],
  }),
  component: Community,
});

const CATEGORIES = ["Geral", "Alertas na estrada", "Dicas", "Eventos", "Oficinas"] as const;

type Post = {
  id: string;
  name: string;
  initial: string;
  time: string;
  text: string;
  likes: number;
  comments: number;
  category: (typeof CATEGORIES)[number];
};

const SEED: Post[] = [
  {
    id: "1",
    name: "Ricardo Alves",
    initial: "R",
    time: "há 12 min",
    text: "Trecho da Rodovia dos Bandeirantes km 45 com óleo na pista. Cuidado, pessoal! 🏍️",
    likes: 34,
    comments: 8,
    category: "Alertas na estrada",
  },
  {
    id: "2",
    name: "Juliana Prado",
    initial: "J",
    time: "há 1h",
    text: "Dica: sempre confira a pressão dos pneus antes de sair. Faz diferença enorme na chuva.",
    likes: 128,
    comments: 22,
    category: "Dicas",
  },
  {
    id: "3",
    name: "Motoclube Aurora",
    initial: "M",
    time: "há 3h",
    text: "Encontro deste sábado confirmado — 07h no posto Anjo Dourado. Venham!",
    likes: 76,
    comments: 14,
    category: "Eventos",
  },
  {
    id: "4",
    name: "Oficina do Zé",
    initial: "O",
    time: "há 6h",
    text: "Revisão completa por R$180 esta semana. Agendem pelo WhatsApp.",
    likes: 41,
    comments: 6,
    category: "Oficinas",
  },
];

function Community() {
  const [active, setActive] = useState<(typeof CATEGORIES)[number]>("Geral");
  const [posts, setPosts] = useState<Post[]>(SEED);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");

  const filtered =
    active === "Geral" ? posts : posts.filter((p) => p.category === active);

  const publish = () => {
    if (!text.trim()) return;
    setPosts([
      {
        id: `p-${Date.now()}`,
        name: "Você",
        initial: "V",
        time: "agora",
        text: text.trim(),
        likes: 0,
        comments: 0,
        category: active === "Geral" ? "Geral" : active,
      },
      ...posts,
    ]);
    setText("");
    setComposing(false);
  };

  const like = (id: string) =>
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, likes: p.likes + 1 } : p)));

  return (
    <AppShell>
      <Header
        title="Comunidade"
        subtitle="Motociclistas conectados"
        showBell
        right={
          <button
            onClick={() => setComposing((c) => !c)}
            className="flex h-10 w-10 items-center justify-center rounded-full gold-gradient text-black shadow-[0_8px_24px_-8px_oklch(0.78_0.13_84/0.6)]"
            aria-label="Nova publicação"
          >
            <Plus size={18} strokeWidth={2.6} />
          </button>
        }
      />

      <div className="scrollbar-hide flex gap-2 overflow-x-auto px-5 pt-4">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition ${
              active === c
                ? "border-gold bg-gold text-black"
                : "border-gold/25 bg-black/40 text-muted-foreground hover:border-gold/50 hover:text-gold"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {composing && (
        <div className="px-5 pt-4">
          <div className="glass-card space-y-3 rounded-2xl p-4 animate-fade-up">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Compartilhe algo com a comunidade..."
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              rows={3}
            />
            <GoldButton size="sm" onClick={publish}>Publicar</GoldButton>
          </div>
        </div>
      )}

      <div className="space-y-3 px-5 pt-4">
        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Users size={28} className="mx-auto text-gold" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma publicação nesta categoria.</p>
          </div>
        ) : (
          filtered.map((p) => (
            <article key={p.id} className="glass-card rounded-2xl p-4 animate-fade-up">
              <header className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gold-gradient text-sm font-black text-black">
                  {p.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {p.time} · {p.category}
                  </p>
                </div>
              </header>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{p.text}</p>
              <footer className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3 text-xs text-muted-foreground">
                <button
                  onClick={() => like(p.id)}
                  className="flex items-center gap-1.5 transition hover:text-gold"
                >
                  <Heart size={14} /> {p.likes}
                </button>
                <span className="flex items-center gap-1.5">
                  <MessageCircle size={14} /> {p.comments}
                </span>
              </footer>
            </article>
          ))
        )}
      </div>

      <SOSFab />
    </AppShell>
  );
}