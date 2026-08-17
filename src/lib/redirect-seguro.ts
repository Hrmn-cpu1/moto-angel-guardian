/**
 * Destino interno seguro (anti open redirect).
 *
 * Motivo: login/register/splash aceitavam qualquer `next` que começasse com
 * "/" — inclusive "//evil.com" e "/\evil.com", que o navegador trata como URL
 * absoluta e leva o usuário (recém-autenticado) para fora do Moto Anjo.
 *
 * Regra única: só sobrevive um caminho relativo à própria origem. Qualquer
 * outra coisa vira o destino padrão.
 */
export const DESTINO_PADRAO = "/dashboard";

export function destinoInternoSeguro(valor: unknown, padrao: string = DESTINO_PADRAO): string {
  if (typeof valor !== "string") return padrao;

  let bruto = valor.trim();
  if (!bruto) return padrao;

  // Decodifica formas encoded que só viram externas depois de normalizar
  // ("%2f%2fevil.com", "%09//evil.com"). decodeURIComponent pode lançar em
  // entrada malformada: entrada malformada não é destino confiável.
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(bruto)) break;
    try {
      const decodificado = decodeURIComponent(bruto);
      if (decodificado === bruto) break;
      bruto = decodificado;
    } catch {
      return padrao;
    }
  }

  // Backslash e caracteres de controle/espaço são normalizados pelo navegador
  // e transformam "/\evil.com" em "//evil.com".
  bruto = bruto.replace(/\\/g, "/");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(bruto)) return padrao;

  // Precisa ser caminho relativo à raiz e não pode ser protocol-relative.
  if (!bruto.startsWith("/")) return padrao;
  if (bruto.startsWith("//")) return padrao;

  // Última linha: resolver contra uma origem sintética e exigir que continue
  // nela. Pega esquemas (javascript:, http://) e truques residuais.
  try {
    const base = "https://moto-anjo.invalid";
    const url = new URL(bruto, base);
    if (url.origin !== base) return padrao;
    const destino = `${url.pathname}${url.search}${url.hash}`;
    if (!destino.startsWith("/") || destino.startsWith("//")) return padrao;
    return destino;
  } catch {
    return padrao;
  }
}

/** Igual a `destinoInternoSeguro`, mas devolve `undefined` quando inválido. */
export function nextInternoOuIndefinido(valor: unknown): string | undefined {
  if (typeof valor !== "string" || !valor.trim()) return undefined;
  const seguro = destinoInternoSeguro(valor, "");
  return seguro || undefined;
}
