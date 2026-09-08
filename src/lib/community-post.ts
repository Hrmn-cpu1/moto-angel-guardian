// Publicação na comunidade: validação, envio real e tradução de erros.
// Mantido fora do componente para poder ser testado sem renderizar a tela.
import { supabase } from "@/integrations/supabase/client";

export type PublicacaoRow = {
  id: string;
  user_id: string;
  author_name: string;
  category: string;
  region: string;
  text: string;
  created_at: string;
};

export type EntradaPublicacao = {
  text: string;
  category: string;
  region: string;
  authorName?: string;
};

export const TEXTO_MINIMO = 2;

/** Retorna a mensagem de validação, ou null quando os campos estão válidos. */
export function validarPublicacao(text: string): string | null {
  const limpo = text.trim();
  if (!limpo) return "Escreva algo antes de publicar.";
  if (limpo.length < TEXTO_MINIMO) return "Escreva um texto um pouco maior.";
  return null;
}

type ErroSupabase = { code?: string | null; message?: string | null };

/** Traduz o erro do banco em uma mensagem clara, por tipo de falha. */
export function mensagemErroPublicacao(erro: unknown): string {
  const e = (erro ?? {}) as ErroSupabase;
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied"))
    return "Sem permissão para publicar com esta conta.";
  if (
    code === "401" ||
    code === "PGRST301" ||
    msg.includes("jwt") ||
    msg.includes("sessão") ||
    msg.includes("not authenticated")
  )
    return "Sua sessão expirou. Entre novamente para publicar.";
  if (code.startsWith("23") || code === "22P02" || msg.includes("violates"))
    return "Confira os campos e tente novamente.";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("offline"))
    return "Sem conexão. Tente novamente.";
  return e.message ? `Não foi possível publicar: ${e.message}` : "Não foi possível publicar.";
}

/**
 * Grava a publicação usando a sessão real do usuário e devolve o registro criado.
 * Lança um Error com mensagem amigável quando o banco recusa.
 */
export async function publicarNaComunidade(entrada: EntradaPublicacao): Promise<PublicacaoRow> {
  const invalido = validarPublicacao(entrada.text);
  if (invalido) throw new Error(invalido);

  const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
  const authUser = sessao?.user;
  if (erroSessao || !authUser) {
    console.error("[Comunidade] sessão indisponível ao publicar", erroSessao);
    throw new Error("Sua sessão expirou. Entre novamente para publicar.");
  }

  const nome =
    (entrada.authorName || "").trim() ||
    (authUser.email ? authUser.email.split("@")[0] : "") ||
    "Motociclista";

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: authUser.id,
      author_name: nome,
      category: entrada.category,
      region: entrada.region.trim(),
      text: entrada.text.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[Comunidade] falha ao publicar", error);
    throw new Error(mensagemErroPublicacao(error));
  }
  return data as PublicacaoRow;
}
