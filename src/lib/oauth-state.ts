/**
 * `state` do OAuth nativo — geração, transporte e validação.
 *
 * Por que este módulo existe (RC7 / P0.2):
 *
 * O caminho nativo gerava `state`, mandava para o broker e NUNCA conferia o
 * valor de volta. `state` sem validação é decoração: é ele que amarra a
 * resposta do provedor à tentativa que este aparelho iniciou (CSRF / login
 * forçado). `code_verifier` protege outra coisa — a troca do código —, então
 * um não substitui o outro.
 *
 * O segundo papel do `state` aqui é carregar o `code_challenge` até a página
 * de callback. Ela roda no Custom Tab (Chrome), que NÃO compartilha
 * armazenamento com a WebView do app; por isso o desafio precisa viajar pela
 * URL. Antes ele ia como query DENTRO do `redirect_uri`
 * (`/auth/callback?native=1&cc=...`), o que é justamente a parte do contrato
 * que o broker pode recusar — o SDK oficial só manda `provider`,
 * `redirect_uri` e `state`, e usa origem limpa. Movendo o desafio para dentro
 * do `state`, o `redirect_uri` volta a ser um caminho simples e o broker
 * recebe exatamente os três parâmetros que ele documenta.
 *
 * Formato: `ma1.<nonce>.<code_challenge>` — só caracteres base64url, sem
 * segredo algum. O `code_verifier` continua exclusivamente no aparelho.
 */

export const PREFIXO_ESTADO_NATIVO = "ma1";
/** Uma tentativa de login não fica de pé por horas. */
export const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

export interface EstadoNativoOAuth {
  nonce: string;
  challenge: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

export function montarEstadoNativo(nonce: string, challenge: string): string {
  return `${PREFIXO_ESTADO_NATIVO}.${nonce}.${challenge}`;
}

/**
 * Segmento do caminho de retorno nativo (P0 — sessão presa no Custom Tab).
 *
 * O `state` era o ÚNICO sinal de que o retorno pertencia ao APK. Quando o
 * broker não devolve o `state` intacto, a página de callback não reconhece o
 * fluxo nativo, cai no caminho de navegador e o supabase-js cria a sessão
 * DENTRO do Chrome — exatamente o sintoma relatado: "entrei no Moto Anjo, mas
 * dentro da aba com a barra lovable.app"; ao fechar a aba, o APK segue
 * deslogado.
 *
 * A correção é não depender de eco: o marcador (`ma1.<nonce>.<challenge>`)
 * viaja no PRÓPRIO caminho do `redirect_uri`, que o provedor é obrigado a
 * preservar. O caminho continua "limpo" (sem query), que é o formato aceito
 * pelo broker. Nenhum segredo vai ali: nonce é público e o challenge é o
 * hash — o `code_verifier` nunca sai do aparelho.
 */
export const SEGMENTO_CALLBACK_NATIVO = "n";

export function caminhoDeCallbackNativo(
  origin: string,
  nonce: string,
  challenge: string,
): string {
  return `${origin}/auth/callback/${SEGMENTO_CALLBACK_NATIVO}/${montarEstadoNativo(nonce, challenge)}`;
}

/** Lê o marcador vindo do caminho — mesmo formato do `state`. */
export function lerMarcadorNativo(marcador: string | null | undefined): EstadoNativoOAuth | null {
  return lerEstadoNativo(marcador ?? null);
}

/** `null` quando não é um state nativo nosso — nunca lança. */
export function lerEstadoNativo(state: string | null | undefined): EstadoNativoOAuth | null {
  if (!state) return null;
  const partes = state.split(".");
  if (partes.length !== 3) return null;
  const [prefixo, nonce, challenge] = partes;
  if (prefixo !== PREFIXO_ESTADO_NATIVO) return null;
  if (!B64URL.test(nonce) || nonce.length < 16) return null;
  if (!B64URL.test(challenge) || challenge.length < 43) return null;
  return { nonce, challenge };
}

/** Comparação de tempo constante: o tamanho já é público, o conteúdo não. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export type FalhaDeEstado = "ausente" | "sem_pendencia" | "expirado" | "divergente";

export interface PendenciaDeEstado {
  nonce: string;
  criadoEm: number;
}

/**
 * Decide se a resposta pode seguir. Falha fechada: qualquer dúvida derruba a
 * tentativa. Puro de propósito — o teste prova as quatro recusas sem Android.
 */
export function validarEstadoDeRetorno(
  recebido: string | null | undefined,
  pendencia: PendenciaDeEstado | null,
  agoraMs: number,
): { ok: true } | { ok: false; falha: FalhaDeEstado } {
  if (!recebido) return { ok: false, falha: "ausente" };
  if (!pendencia) return { ok: false, falha: "sem_pendencia" };
  if (agoraMs - pendencia.criadoEm > VALIDADE_ESTADO_MS) return { ok: false, falha: "expirado" };
  const lido = lerEstadoNativo(recebido);
  const nonceRecebido = lido ? lido.nonce : recebido;
  if (!iguaisEmTempoConstante(nonceRecebido, pendencia.nonce)) {
    return { ok: false, falha: "divergente" };
  }
  return { ok: true };
}
