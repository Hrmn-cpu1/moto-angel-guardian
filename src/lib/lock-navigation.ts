import type { PontoDaRota } from "./rota.ts";
import type { QuadroNavegacaoBloqueada } from "./trip-service.ts";

/**
 * Navegação na tela de bloqueio — regras puras (P0.1c).
 *
 * O QUE ESTE MÓDULO É
 * A tradução entre o estado REAL da viagem (rota, manobra, ETA, posição, aviso
 * do Copiloto) e o quadro mínimo que o Android desenha sobre o keyguard. Ele
 * não cria viagem, não calcula rota, não liga GPS e não aciona SOS: só
 * escolhe o que pode aparecer e reduz o traçado a um tamanho barato.
 *
 * PRIVACIDADE
 * A tela de bloqueio é pública: qualquer pessoa que pegar o aparelho vê. Por
 * isso o quadro carrega apenas navegação. Nome, e-mail, telefone, contatos de
 * confiança e qualquer texto com cara de e-mail ou telefone são removidos —
 * inclusive quando vierem por engano dentro do rótulo do destino.
 *
 * PADRÃO DELIBERADO: LIGADO.
 * O produto é navegação para quem pilota; com a preferência desligada o
 * recurso simplesmente não existe para o usuário e o valor de segurança se
 * perde no primeiro uso. Como nenhum dado pessoal é exibido, o risco de expor
 * algo sensível é baixo, e a chave fica visível no Perfil para desligar em um
 * toque. Trocar este padrão é decisão de produto, não detalhe técnico.
 */

export const CHAVE_LOCK_NAV = "motoanjo.navegacao_tela_bloqueada";

/** Documentado acima. Mudar aqui muda o comportamento de todo mundo. */
export const LOCK_NAV_PADRAO = true;

/** Traçado longo não cabe nem ajuda: 120 pares já desenham a forma da rota. */
export const MAX_PONTOS_TRACADO = 120;

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

function armazenamento(): Armazenamento | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function preferenciaTelaBloqueada(store: Armazenamento | null = armazenamento()): boolean {
  if (!store) return LOCK_NAV_PADRAO;
  try {
    const v = store.getItem(CHAVE_LOCK_NAV);
    if (v === "0") return false;
    if (v === "1") return true;
    return LOCK_NAV_PADRAO;
  } catch {
    return LOCK_NAV_PADRAO;
  }
}

export function definirPreferenciaTelaBloqueada(
  ativa: boolean,
  store: Armazenamento | null = armazenamento(),
): void {
  if (!store) return;
  try {
    store.setItem(CHAVE_LOCK_NAV, ativa ? "1" : "0");
  } catch {
    /* modo privado: a preferência volta ao padrão, e nada quebra */
  }
}

/* ================================================================== *
 * Higiene do texto
 * ================================================================== */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Sequências longas de dígitos com separadores típicos de telefone.
const TELEFONE = /(\+?\d[\d\s().-]{7,}\d)/g;

/** Remove o que não pode aparecer com o aparelho bloqueado. */
export function textoPublico(valor: unknown, limite = 60): string {
  if (typeof valor !== "string") return "";
  const limpo = valor.replace(EMAIL, "").replace(TELEFONE, "").replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite - 1).trimEnd()}…`;
}

/**
 * Reduz o traçado por amostragem uniforme, mantendo início e fim.
 *
 * Nada de "simplificar" com heurística: o desenho da tela de bloqueio é
 * pequeno, e perder o primeiro ou o último ponto mudaria o enquadramento.
 */
export function reduzirTracado(
  pontos: readonly PontoDaRota[] | null | undefined,
  maximo = MAX_PONTOS_TRACADO,
): number[] {
  if (!Array.isArray(pontos) || pontos.length === 0 || maximo < 2) return [];
  const validos = pontos.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (validos.length === 0) return [];
  if (validos.length <= maximo) return validos.flatMap((p) => [p.lat, p.lng]);

  const saida: number[] = [];
  const passo = (validos.length - 1) / (maximo - 1);
  for (let i = 0; i < maximo; i++) {
    const p = validos[Math.round(i * passo)];
    saida.push(p.lat, p.lng);
  }
  return saida;
}

/* ================================================================== *
 * Montagem do quadro
 * ================================================================== */

export interface EntradaNavegacaoBloqueada {
  /** `true` somente com a viagem REALMENTE ativa. */
  viagemAtiva: boolean;
  /** Preferência do usuário. */
  permitida: boolean;
  manobra?: string | null;
  distanciaManobra?: string | null;
  destino?: string | null;
  restante?: string | null;
  eta?: string | null;
  /** Resumo do Copiloto: categoria e distância, nunca dado pessoal. */
  risco?: string | null;
  posicao?: { lat: number; lng: number } | null;
  tracado?: readonly PontoDaRota[] | null;
}

export const QUADRO_VAZIO: QuadroNavegacaoBloqueada = {
  ativa: false,
  permitida: false,
  manobra: "",
  distanciaManobra: "",
  destino: "",
  restante: "",
  eta: "",
  risco: "",
  lat: 0,
  lng: 0,
  rota: [],
};

/**
 * Monta o quadro. Sem viagem ativa ou sem permissão, devolve o quadro vazio —
 * é isto que impede a tela de bloqueio de continuar anunciando navegação
 * depois do fim da viagem, mesmo que a Activity seja recriada pelo sistema.
 */
export function montarQuadroBloqueado(e: EntradaNavegacaoBloqueada): QuadroNavegacaoBloqueada {
  if (!e.viagemAtiva || !e.permitida) return { ...QUADRO_VAZIO };
  const pos =
    e.posicao && Number.isFinite(e.posicao.lat) && Number.isFinite(e.posicao.lng)
      ? e.posicao
      : null;
  return {
    ativa: true,
    permitida: true,
    manobra: textoPublico(e.manobra, 48),
    distanciaManobra: textoPublico(e.distanciaManobra, 16),
    destino: textoPublico(e.destino, 48),
    restante: textoPublico(e.restante, 16),
    eta: textoPublico(e.eta, 16),
    risco: textoPublico(e.risco, 48),
    lat: pos ? pos.lat : 0,
    lng: pos ? pos.lng : 0,
    rota: reduzirTracado(e.tracado),
  };
}

/** Dois quadros iguais não precisam atravessar a ponte. */
export function quadrosIguais(a: QuadroNavegacaoBloqueada, b: QuadroNavegacaoBloqueada): boolean {
  return (
    a.ativa === b.ativa &&
    a.permitida === b.permitida &&
    a.manobra === b.manobra &&
    a.distanciaManobra === b.distanciaManobra &&
    a.destino === b.destino &&
    a.restante === b.restante &&
    a.eta === b.eta &&
    a.risco === b.risco &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.rota.length === b.rota.length &&
    a.rota.every((v, i) => v === b.rota[i])
  );
}
