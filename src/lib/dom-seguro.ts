/**
 * Construção de overlays do mapa sem `innerHTML`.
 *
 * Nome de motociclista, nome de parceiro, benefício e URL de avatar vêm do
 * banco — ou seja, de outro usuário. Interpolar esses valores em uma string de
 * HTML transforma qualquer cadastro em injeção de marcação na WebView. Aqui
 * tudo vira nó do DOM com `textContent`, que não interpreta marcação.
 */

/** Subconjunto de `Document` usado pelos overlays — permite testar sem DOM. */
export interface DocumentoMinimo {
  createElement: (tag: string) => ElementoMinimo;
}

export interface ElementoMinimo {
  className?: string;
  textContent?: string | null;
  setAttribute: (nome: string, valor: string) => void;
  appendChild: (filho: unknown) => unknown;
}

export interface EspecificacaoDeElemento {
  classe?: string;
  /** Texto NÃO confiável. Sempre aplicado como texto, nunca como marcação. */
  texto?: string | null;
  atributos?: Record<string, string | null | undefined>;
  filhos?: EspecificacaoDeElemento[];
  tag?: string;
}

/** Só http(s) vira `src`. Bloqueia `javascript:` e `data:` em avatar/logo. */
export function urlDeImagemSegura(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!/^https?:\/\//i.test(limpo)) return null;
  return limpo;
}

export function criarElemento<E extends ElementoMinimo>(
  doc: DocumentoMinimo,
  tag: string,
  spec: EspecificacaoDeElemento = {},
): E {
  const el = doc.createElement(tag) as E;
  if (spec.classe) el.className = spec.classe;
  if (spec.texto != null) el.textContent = spec.texto;
  for (const [nome, valor] of Object.entries(spec.atributos ?? {})) {
    if (typeof valor === "string") el.setAttribute(nome, valor);
  }
  for (const filho of spec.filhos ?? []) {
    el.appendChild(criarElemento(doc, filho.tag ?? "span", filho));
  }
  return el;
}

/** Inicial exibida quando não há imagem. Nunca vazia, nunca marcação. */
export function inicialDe(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  return limpo ? limpo.charAt(0).toUpperCase() : "?";
}
