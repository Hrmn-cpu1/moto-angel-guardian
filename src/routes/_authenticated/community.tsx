import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, MapPin, MessageCircle, Plus, Send, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { GoldButton } from "@/components/GoldButton";
import { supabase } from "@/integrations/supabase/client";
import { publicarNaComunidade, validarPublicacao } from "@/lib/community-post";
import { useAuth } from "@/hooks/useAuth";


export const Route = createFileRoute("/_authenticated/community")({
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

type PostRow = {
  id: string;
  user_id: string;
  author_name: string;
  category: string;
  region: string;
  text: string;
  created_at: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  text: string;
  created_at: string;
};

type FeedRow = PostRow & {
  likes_count: number;
  comments_count: number;
  liked: boolean;
};

type FeedPost = PostRow & {
  likes: number;
  liked: boolean;
  commentsCount: number;
};

const feedKey = ["community", "feed"] as const;

// One aggregated RPC replaces three unbounded table reads (posts + all likes
// + all comments) that previously ran on every feed refresh.
async function fetchFeed(): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("community_feed", { _limit: 100 });
  if (error) throw error;
  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    author_name: r.author_name,
    category: r.category,
    region: r.region,
    text: r.text,
    created_at: r.created_at,
    likes: Number(r.likes_count),
    liked: !!r.liked,
    commentsCount: Number(r.comments_count),
  }));
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function initialOf(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function Community() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Geral");
  const [regionFilter, setRegionFilter] = useState("");
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [postRegion, setPostRegion] = useState("");
  const [postCategory, setPostCategory] = useState<(typeof CATEGORIES)[number]>("Geral");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishOk, setPublishOk] = useState(false);
  const publishing_ = useRef(false);

  const {
    data: posts = [],
    isLoading: loading,
    error: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: feedKey,
    queryFn: fetchFeed,
    staleTime: 15_000,
    retry: 2,
  });


  useEffect(() => {
    // Realtime bursts (a post + its likes/comments) are coalesced so the feed
    // is refetched once instead of on every single row event.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void qc.invalidateQueries({ queryKey: feedKey });
      }, 400);
    };
    const ch = supabase
      .channel("community-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_posts" },
        scheduleLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_likes" },
        scheduleLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_comments" },
        (payload) => {
          scheduleLoad();
          const row = (payload.new || payload.old) as CommentRow | undefined;
          if (row && openComments === row.post_id) void loadComments(row.post_id);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => p.region.trim() && set.add(p.region.trim()));
    return Array.from(set).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (category !== "Geral" && p.category !== category) return false;
      if (regionFilter && p.region.trim().toLowerCase() !== regionFilter.toLowerCase())
        return false;
      return true;
    });
  }, [posts, category, regionFilter]);

  const publish = async () => {
    if (publishing_.current) return;
    const invalido = validarPublicacao(text);
    if (invalido) {
      setPublishError(invalido);
      return;
    }
    publishing_.current = true;
    setPublishing(true);
    setPublishError(null);
    setPublishOk(false);
    try {
      const row = await publicarNaComunidade({
        text,
        category: postCategory,
        region: postRegion,
        authorName: user?.name || user?.email?.split("@")[0],
      });
      // Confirmado pelo banco: mostra imediatamente e recarrega do servidor.
      qc.setQueryData<FeedPost[]>(feedKey, (ps) => [
        { ...row, likes: 0, liked: false, commentsCount: 0 },
        ...(ps ?? []).filter((p) => p.id !== row.id),
      ]);
      void qc.invalidateQueries({ queryKey: feedKey });
      setText("");
      setPostRegion("");
      setComposing(false);
      setPublishOk(true);
      setTimeout(() => setPublishOk(false), 4000);
    } catch (e) {
      console.error("[Comunidade] publicação não concluída", e);
      setPublishError(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally {
      publishing_.current = false;
      setPublishing(false);
    }
  };


  const toggleLike = async (post: FeedPost) => {
    if (!user) return;
    // Optimistic cache update; realtime/invalidations reconcile the truth.
    qc.setQueryData<FeedPost[]>(feedKey, (ps) =>
      (ps ?? []).map((p) =>
        p.id === post.id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p,
      ),
    );
    if (post.liked) {
      await supabase.from("community_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      await supabase.from("community_likes").insert({ post_id: post.id, user_id: user.id });
    }
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from("community_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setComments((prev) => ({ ...prev, [postId]: (data ?? []) as CommentRow[] }));
  };

  const toggleComments = async (postId: string) => {
    if (openComments === postId) {
      setOpenComments(null);
      return;
    }
    setOpenComments(postId);
    setCommentDraft("");
    if (!comments[postId]) await loadComments(postId);
  };

  const sendComment = async (postId: string) => {
    if (!commentDraft.trim() || !user) return;
    const draft = commentDraft.trim();
    setCommentDraft("");
    await supabase.from("community_comments").insert({
      post_id: postId,
      user_id: user.id,
      author_name: user.name || user.email.split("@")[0],
      text: draft,
    });
    await loadComments(postId);
  };

  const deletePost = async (postId: string) => {
    await supabase.from("community_posts").delete().eq("id", postId);
  };

  const deleteComment = async (postId: string, commentId: string) => {
    await supabase.from("community_comments").delete().eq("id", commentId);
    await loadComments(postId);
  };

  return (
    <AppShell>
      <Header
        title="Comunidade"
        subtitle="Motociclistas conectados"
        showBell
        right={
          <button
            onClick={() => setComposing((c) => !c)}
            className="flex h-10 w-10 items-center justify-center rounded-full gold-gradient text-black shadow-[0_8px_24px_-8px_oklch(0.83_0.169_85/0.6)]"
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
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition ${
              category === c
                ? "border-gold bg-gold text-black"
                : "border-gold/25 bg-black/40 text-muted-foreground hover:border-gold/50 hover:text-gold"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-5 pt-3">
        <MapPin size={14} className="text-gold shrink-0" />
        <input
          list="motoanjo-regions"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          placeholder="Filtrar por região (ex: São Paulo, SP)"
          className="w-full rounded-full border border-gold/25 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-gold/60"
        />
        <datalist id="motoanjo-regions">
          {regions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {regionFilter && (
          <button
            onClick={() => setRegionFilter("")}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-gold"
          >
            limpar
          </button>
        )}
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="flex-1 rounded-lg border border-gold/25 bg-black/60 px-3 py-2 text-xs text-foreground outline-none focus:border-gold/60"
              >
                {CATEGORIES.filter((c) => c !== "Geral").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="Geral">Geral</option>
              </select>
              <input
                value={postRegion}
                onChange={(e) => setPostRegion(e.target.value)}
                placeholder="Região (ex: Curitiba, PR)"
                className="flex-1 rounded-lg border border-gold/25 bg-black/60 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-gold/60"
              />
            </div>
            <div className="flex justify-end">
              <GoldButton size="sm" onClick={publish} disabled={publishing}>
                {publishing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Publicando…
                  </>
                ) : (
                  "Publicar"
                )}
              </GoldButton>
            </div>
            {publishError && (
              <p role="alert" className="text-[11px] text-emergency">
                {publishError}
              </p>
            )}
            {!user && (
              <p className="text-[10px] uppercase tracking-widest text-emergency">
                Entre na sua conta para publicar.
              </p>
            )}
          </div>
        </div>
      )}

      {publishOk && (
        <div className="px-5 pt-4">
          <p
            role="status"
            className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-gold"
          >
            Publicação realizada
          </p>
        </div>
      )}

      <div className="space-y-3 px-5 pt-4">
        {loading ? (
          <div className="glass-card rounded-2xl p-5 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Carregando feed...
          </div>
        ) : feedError ? (
          <div className="glass-card rounded-2xl p-5 text-center">
            <p role="alert" className="text-sm text-emergency">
              Não foi possível carregar as publicações.
            </p>
            <button
              onClick={() => void refetchFeed()}
              className="mt-3 text-[11px] uppercase tracking-widest text-gold"
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (

          <div className="glass-card rounded-2xl p-5 text-center">
            <Users size={28} className="mx-auto text-gold" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma publicação {regionFilter ? `em ${regionFilter}` : "nesta categoria"}.
            </p>
          </div>
        ) : (
          filtered.map((p) => (
            <article key={p.id} className="glass-card rounded-2xl p-4 animate-fade-up">
              <header className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gold-gradient text-sm font-black text-black">
                  {initialOf(p.author_name || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {p.author_name || "Motociclista"}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {relTime(p.created_at)} · {p.category}
                    {p.region ? ` · ${p.region}` : ""}
                  </p>
                </div>
                {user?.id === p.user_id && (
                  <button
                    onClick={() => deletePost(p.id)}
                    aria-label="Apagar publicação"
                    className="text-muted-foreground/60 hover:text-emergency"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </header>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {p.text}
              </p>
              <footer className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3 text-xs text-muted-foreground">
                <button
                  onClick={() => toggleLike(p)}
                  className={`flex items-center gap-1.5 transition ${p.liked ? "text-gold" : "hover:text-gold"}`}
                  aria-pressed={p.liked}
                >
                  <Heart size={14} fill={p.liked ? "currentColor" : "none"} /> {p.likes}
                </button>
                <button
                  onClick={() => toggleComments(p.id)}
                  className="flex items-center gap-1.5 transition hover:text-gold"
                >
                  <MessageCircle size={14} /> {p.commentsCount}
                </button>
              </footer>

              {openComments === p.id && (
                <div className="mt-3 space-y-2 border-t border-white/5 pt-3 animate-fade-up">
                  {(comments[p.id] ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground/70">
                      Seja o primeiro a comentar.
                    </p>
                  )}
                  {(comments[p.id] ?? []).map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 text-[10px] font-bold text-gold">
                        {initialOf(c.author_name || "?")}
                      </div>
                      <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-black/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] font-semibold text-foreground">
                            {c.author_name || "Motociclista"}
                          </p>
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                            {relTime(c.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground/90">
                          {c.text}
                        </p>
                      </div>
                      {user?.id === c.user_id && (
                        <button
                          onClick={() => deleteComment(p.id, c.id)}
                          aria-label="Apagar comentário"
                          className="text-muted-foreground/60 hover:text-emergency"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {user && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendComment(p.id);
                          }
                        }}
                        placeholder="Escreva um comentário..."
                        className="flex-1 rounded-full border border-gold/25 bg-black/60 px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-gold/60"
                      />
                      <button
                        onClick={() => sendComment(p.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full gold-gradient text-black"
                        aria-label="Enviar comentário"
                      >
                        <Send size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
