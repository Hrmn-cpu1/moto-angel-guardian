/**
 * Navegação externa e normalização de destino.
 *
 * PROBLEMA REAL (RC1): tocar em "Abrir no Google Maps" dentro do APK dava
 * ERR_UNKNOWN_URL_SCHEME. O app nunca escreveu `intent://` em lugar nenhum —
 * a origem é outra: navegar a própria WebView para `https://www.google.com/maps…`
 * faz o servidor do Google responder com um redirecionamento `intent://` para
 * abrir o aplicativo nativo. A WebView do Capacitor não sabe o que fazer com
 * esse esquema e mostra o erro.
 *
 * REGRA DESTE MÓDULO
 *   1. nunca navegar a WebView no lugar (`location.href = …`, `<a href>` sem
 *      target) para um destino de mapa;
 *   2. nunca construir `intent://`;
 *   3. sempre entregar o link a quem sabe abrir aplicativo — plugin nativo
 *      quando existir, `window.open(url, "_blank")` como caminho padrão do
 *      Capacitor, aba nova no navegador como último recurso.
 *
 * A ponte usa `isNativeApp()` de `native.ts` e o `@capacitor/browser` que o
 * projeto já tem, por import dinâmico — o mesmo padrão de `native.ts`. Nenhuma
 * dependência nova, e o comportamento no navegador não muda.
 */

import { isNativeApp } from "./native.ts";

export type NavProvider = "google" | "waze" | "motoanjo";

export interface Destination {
  latitude?: number;
  longitude?: number;
  address?: string;
  label?: string;
  source?: string;
}

export interface AberturaExterna {
  ok: boolean;
  url: string;
  via: "navegador-nativo" | "janela" | "nenhum";
}

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/** Coordenada utilizável: dentro da faixa, finita e diferente de Null Island. */
export function coordenadaValida(lat?: number, lng?: number): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < LAT_MIN || lat > LAT_MAX) return false;
  if (lng < LNG_MIN || lng > LNG_MAX) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function destinoUtilizavel(d: Destination | null): d is Destination {
  if (!d) return false;
  if (coordenadaValida(d.latitude, d.longitude)) return true;
  return typeof d.address === "string" && d.address.trim().length >= 3;
}

/* ================================================================== *
 * Parser de destino (Checkpoint G2)
 *
 * Entrada não confiável: pode vir de um app externo, de um compartilhamento
 * do Android ou de um campo de texto. Nada aqui executa, navega ou busca —
 * só normaliza ou recusa.
 * ================================================================== */

const ESQUEMAS_PROIBIDOS = /^(javascript|data|file|blob|intent|content|vbscript):/i;

function numero(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const limpo = v.trim();
  if (!limpo || !/^[-+]?\d+(\.\d+)?$/.test(limpo)) return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

function deParDeCoordenadas(texto: string, source: string): Destination | null {
  const m = /^\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/.exec(texto);
  if (!m) return null;
  const lat = numero(m[1]);
  const lng = numero(m[2]);
  if (!coordenadaValida(lat, lng)) return null;
  return { latitude: lat, longitude: lng, source };
}

function deGeoUri(texto: string): Destination | null {
  if (!/^geo:/i.test(texto)) return null;
  const corpo = texto.slice(4);
  const [antesDaQuery, query = ""] = corpo.split("?");
  const params = new URLSearchParams(query);
  const q = params.get("q");

  // geo:0,0?q=<endereço> ou geo:0,0?q=<lat,lng>(rótulo)
  if (q) {
    const semRotulo = q.replace(/\(([^)]*)\)\s*$/, "").trim();
    const rotulo = /\(([^)]*)\)\s*$/.exec(q)?.[1]?.trim();
    const porCoordenada = deParDeCoordenadas(semRotulo, "geo");
    if (porCoordenada) return { ...porCoordenada, label: rotulo };
    if (semRotulo.length >= 3) {
      return { address: decodeURIComponent(semRotulo), label: rotulo, source: "geo" };
    }
  }

  const direto = deParDeCoordenadas(antesDaQuery.split(";")[0], "geo");
  return direto;
}

function deUrlDeMapa(texto: string): Destination | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const ehMapa =
    /(^|\.)google\.[a-z.]+$/.test(host) ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    /(^|\.)waze\.com$/.test(host);
  if (!ehMapa) return null;

  const source = /waze/.test(host) ? "waze-url" : "google-url";

  for (const chave of ["destination", "q", "query", "ll", "daddr", "center"]) {
    const valor = url.searchParams.get(chave);
    if (!valor) continue;
    const porCoordenada = deParDeCoordenadas(valor, source);
    if (porCoordenada) return porCoordenada;
    if (chave !== "ll" && chave !== "center" && valor.trim().length >= 3) {
      return { address: valor.trim(), source };
    }
  }

  // .../@-23.55,-46.63,15z  e  .../dir/.../-23.55,-46.63
  const noCaminho = /@?(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(url.pathname);
  if (noCaminho) {
    const achado = deParDeCoordenadas(`${noCaminho[1]},${noCaminho[2]}`, source);
    if (achado) return achado;
  }
  return null;
}

/**
 * Normaliza qualquer entrada em um Destination, ou devolve null.
 * Recusa esquema perigoso, texto vazio, coordenada fora de faixa e URL alheia.
 */
export function normalizarDestino(entrada: unknown): Destination | null {
  if (typeof entrada === "object" && entrada !== null) {
    const d = entrada as Destination;
    if (coordenadaValida(d.latitude, d.longitude)) {
      return {
        latitude: d.latitude,
        longitude: d.longitude,
        address: typeof d.address === "string" ? d.address.trim() || undefined : undefined,
        label: typeof d.label === "string" ? d.label.trim() || undefined : undefined,
        source: d.source ?? "objeto",
      };
    }
    if (typeof d.address === "string" && d.address.trim().length >= 3) {
      return { address: d.address.trim(), label: d.label, source: d.source ?? "objeto" };
    }
    return null;
  }

  if (typeof entrada !== "string") return null;
  const texto = entrada.trim();
  if (texto.length === 0 || texto.length > 2000) return null;
  if (ESQUEMAS_PROIBIDOS.test(texto)) return null;

  return (
    deGeoUri(texto) ??
    deParDeCoordenadas(texto, "texto") ??
    deUrlDeMapa(texto) ??
    (/^motoanjo:\/\//i.test(texto)
      ? normalizarDestino(texto.replace(/^motoanjo:\/\/(navegar|rota)\/?\??/i, ""))
      : null) ??
    (texto.length >= 3 && !/^[a-z][a-z0-9+.-]*:/i.test(texto)
      ? { address: texto, source: "texto" }
      : null)
  );
}

/* ================================================================== *
 * Construção de URL — sempre HTTPS, nunca intent://
 * ================================================================== */

export function urlDeNavegacao(provider: NavProvider, destino: Destination): string {
  const temCoordenada = coordenadaValida(destino.latitude, destino.longitude);
  const par = temCoordenada ? `${destino.latitude},${destino.longitude}` : "";
  const endereco = (destino.address ?? "").trim();

  if (provider === "waze") {
    // A URL universal do Waze abre o aplicativo quando instalado e o site
    // quando não está. `navigate=yes` já inicia a rota.
    return temCoordenada
      ? `https://www.waze.com/ul?ll=${encodeURIComponent(par)}&navigate=yes`
      : `https://www.waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`;
  }

  if (provider === "motoanjo") {
    const q = temCoordenada ? par : endereco;
    return `/mapa?destino=${encodeURIComponent(q)}`;
  }

  // Google: URL universal documentada, sem esquema proprietário.
  return temCoordenada
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(par)}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}&travelmode=driving`;
}

/** Só para ver um ponto no mapa, sem traçar rota. */
export function urlDePonto(destino: Destination): string {
  if (coordenadaValida(destino.latitude, destino.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${destino.latitude},${destino.longitude}`,
    )}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    (destino.address ?? "").trim(),
  )}`;
}

/* ================================================================== *
 * Abertura
 *
 * Uma ponte só, apoiada nos plugins que o projeto JÁ tem
 * (`@capacitor/browser`) e no detector que já existe (`native.ts`). Nada de
 * adivinhar `window.Capacitor.Plugins.*` nem de dependência nova.
 * ================================================================== */

/** Injetável para teste: a decisão é testada sem navegador e sem Android. */
export interface PonteExterna {
  nativo: () => boolean;
  /** Retorna true se a janela foi realmente entregue ao sistema. */
  abrirJanela: (url: string) => boolean;
  abrirNavegadorNativo: (url: string) => Promise<void>;
}

const ponteReal: PonteExterna = {
  nativo: () => isNativeApp(),
  abrirJanela: (url) => {
    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    // No Android, o bridge do Capacitor intercepta o alvo _blank e dispara um
    // ACTION_VIEW: é assim que o Google Maps abre de verdade, fora da WebView.
    const janela = window.open(url, "_blank", "noopener,noreferrer");
    return janela !== null;
  },
  abrirNavegadorNativo: async (url) => {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  },
};

/**
 * Abre o destino FORA da WebView.
 *
 * Ordem no aparelho: janela do sistema primeiro (abre o app do Google Maps
 * quando instalado), navegador nativo em seguida. Em nenhum momento a WebView
 * navega no lugar, então ERR_UNKNOWN_URL_SCHEME não é alcançável por aqui.
 */
export async function abrirNavegacaoExterna(
  provider: NavProvider,
  destino: Destination | null,
  ponte: PonteExterna = ponteReal,
): Promise<AberturaExterna> {
  if (!destinoUtilizavel(destino)) {
    return { ok: false, url: "", via: "nenhum" };
  }
  const url = urlDeNavegacao(provider, destino);

  if (ponte.abrirJanela(url)) {
    return { ok: true, url, via: "janela" };
  }

  if (ponte.nativo()) {
    try {
      await ponte.abrirNavegadorNativo(url);
      return { ok: true, url, via: "navegador-nativo" };
    } catch {
      return { ok: false, url, via: "nenhum" };
    }
  }

  return { ok: false, url, via: "nenhum" };
}

/** Só ver o ponto no mapa, sem traçar rota — mesma ponte. */
export async function abrirPontoExterno(
  destino: Destination | null,
  ponte: PonteExterna = ponteReal,
): Promise<AberturaExterna> {
  if (!destinoUtilizavel(destino)) return { ok: false, url: "", via: "nenhum" };
  const url = urlDePonto(destino);
  if (ponte.abrirJanela(url)) return { ok: true, url, via: "janela" };
  if (ponte.nativo()) {
    try {
      await ponte.abrirNavegadorNativo(url);
      return { ok: true, url, via: "navegador-nativo" };
    } catch {
      return { ok: false, url, via: "nenhum" };
    }
  }
  return { ok: false, url, via: "nenhum" };
}
