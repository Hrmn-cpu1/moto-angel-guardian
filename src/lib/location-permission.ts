/**
 * Estado real da permissão de localização.
 *
 * BUG REAL (RC1, reproduzido no Samsung): a Home guardava a permissão em
 * `useState(false)` dentro da rota. Trocar de aba desmonta o componente, o
 * estado volta a false e o onboarding "Precisamos da sua localização"
 * reaparece mesmo com a permissão já concedida.
 *
 * Duas correções moram aqui:
 *   1. o estado vive no MÓDULO, não no componente — sobrevive a
 *      montar/desmontar e é compartilhado por Home, Mapa e o que mais
 *      precisar;
 *   2. a fonte da verdade é a plataforma, não a memória do app: no Android
 *      consultamos o plugin nativo quando ele existe, e no navegador a
 *      Permissions API. A permissão pode ser revogada com o app em segundo
 *      plano, então reconsultamos ao voltar para a tela.
 *
 * A parte de decisão é pura e testável (`traduzirEstadoNativo`,
 * `traduzirEstadoWeb`, `precisaMostrarGate`).
 */

import { isNativeApp } from "./native.ts";

export type StatusPermissao =
  | "desconhecido"
  | "verificando"
  | "concedida"
  | "perguntar"
  | "negada"
  | "negada_permanente"
  | "indisponivel";

export interface LeituraPermissao {
  status: StatusPermissao;
  /** Em que camada a leitura foi feita — entra no diagnóstico, não na UI. */
  origem: "nativo" | "web" | "cache" | "nenhuma";
}

/* ================================================================== *
 * Tradução — pura
 * ================================================================== */

/** Resposta do Geolocation do Capacitor: granted | denied | prompt | prompt-with-rationale. */
export function traduzirEstadoNativo(valor: unknown): StatusPermissao {
  switch (String(valor)) {
    case "granted":
      return "concedida";
    case "denied":
      // No Android, `denied` depois de o usuário ter marcado "não perguntar
      // novamente" só é resolvido nas Configurações do aparelho.
      return "negada_permanente";
    case "prompt":
    case "prompt-with-rationale":
      return "perguntar";
    default:
      return "desconhecido";
  }
}

/** Resposta da Permissions API do navegador: granted | denied | prompt. */
export function traduzirEstadoWeb(valor: unknown): StatusPermissao {
  switch (String(valor)) {
    case "granted":
      return "concedida";
    case "denied":
      return "negada";
    case "prompt":
      return "perguntar";
    default:
      return "desconhecido";
  }
}

/** Erro do getCurrentPosition vira status. */
export function traduzirErroDeGps(codigo: number, permissionDenied = 1): StatusPermissao {
  return codigo === permissionDenied ? "negada" : "perguntar";
}

/**
 * A tela deve mostrar o onboarding de localização?
 * Concedida nunca mostra — é isso que conserta o bug de trocar de aba.
 */
export function precisaMostrarGate(status: StatusPermissao): boolean {
  return status !== "concedida" && status !== "verificando";
}

/** Só faz sentido oferecer "Abrir configurações" quando o pedido não volta mais. */
export function ofereceConfiguracoes(status: StatusPermissao): boolean {
  return status === "negada_permanente";
}

/* ================================================================== *
 * Cache de módulo + assinantes
 * ================================================================== */

let atual: LeituraPermissao = { status: "desconhecido", origem: "nenhuma" };
const assinantes = new Set<(l: LeituraPermissao) => void>();

export function leituraAtual(): LeituraPermissao {
  return atual;
}

export function definirLeitura(leitura: LeituraPermissao): void {
  atual = leitura;
  for (const assinante of assinantes) assinante(leitura);
}

export function assinarPermissao(fn: (l: LeituraPermissao) => void): () => void {
  assinantes.add(fn);
  return () => {
    assinantes.delete(fn);
  };
}

/** Só para os testes: zera o estado compartilhado. */
export function _resetarPermissao(): void {
  atual = { status: "desconhecido", origem: "nenhuma" };
  assinantes.clear();
}

/* ================================================================== *
 * Leitura na plataforma
 * ================================================================== */

type EstadoPlugin = { location?: string; coarseLocation?: string };

/**
 * Mesmo padrão de `native.ts`: import dinâmico do pacote que o projeto já
 * tem, e não adivinhação de `window.Capacitor.Plugins.*`. No navegador a
 * função devolve null e o caminho web assume.
 */
async function pluginGeolocation(): Promise<{
  checkPermissions: () => Promise<EstadoPlugin>;
  requestPermissions: (o?: unknown) => Promise<EstadoPlugin>;
} | null> {
  if (!isNativeApp()) return null;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    return Geolocation as unknown as {
      checkPermissions: () => Promise<EstadoPlugin>;
      requestPermissions: (o?: unknown) => Promise<EstadoPlugin>;
    };
  } catch {
    return null;
  }
}

export async function consultarPermissao(): Promise<LeituraPermissao> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    const leitura: LeituraPermissao = { status: "indisponivel", origem: "nenhuma" };
    definirLeitura(leitura);
    return leitura;
  }

  const nativo = await pluginGeolocation();
  if (nativo) {
    try {
      const r = await nativo.checkPermissions();
      const status = traduzirEstadoNativo(r.location ?? r.coarseLocation);
      if (status !== "desconhecido") {
        const leitura: LeituraPermissao = { status, origem: "nativo" };
        definirLeitura(leitura);
        return leitura;
      }
    } catch {
      // cai para a Permissions API
    }
  }

  const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (perms?.query) {
    try {
      const status = await perms.query({ name: "geolocation" as PermissionName });
      const traduzido = traduzirEstadoWeb(status.state);
      const leitura: LeituraPermissao = { status: traduzido, origem: "web" };
      definirLeitura(leitura);
      status.onchange = () => {
        definirLeitura({ status: traduzirEstadoWeb(status.state), origem: "web" });
      };
      return leitura;
    } catch {
      // navegador sem suporte a consultar geolocation
    }
  }

  // Sem como consultar: se já sabíamos que estava concedida, mantemos —
  // caso contrário perguntamos.
  const leitura: LeituraPermissao =
    atual.status === "concedida"
      ? { status: "concedida", origem: "cache" }
      : { status: "perguntar", origem: "nenhuma" };
  definirLeitura(leitura);
  return leitura;
}

export async function pedirPermissao(): Promise<LeituraPermissao> {
  const nativo = await pluginGeolocation();
  if (nativo) {
    try {
      const r = await nativo.requestPermissions({ permissions: ["location", "coarseLocation"] });
      const status = traduzirEstadoNativo(r.location ?? r.coarseLocation);
      if (status !== "desconhecido") {
        const leitura: LeituraPermissao = { status, origem: "nativo" };
        definirLeitura(leitura);
        return leitura;
      }
    } catch {
      // cai para o pedido do navegador
    }
  }

  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const leitura: LeituraPermissao = { status: "indisponivel", origem: "nenhuma" };
      definirLeitura(leitura);
      resolve(leitura);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        const leitura: LeituraPermissao = { status: "concedida", origem: "web" };
        definirLeitura(leitura);
        resolve(leitura);
      },
      (err) => {
        const leitura: LeituraPermissao = {
          status: traduzirErroDeGps(err.code, err.PERMISSION_DENIED),
          origem: "web",
        };
        definirLeitura(leitura);
        resolve(leitura);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/**
 * Abre as Configurações do aplicativo. Depende de plugin nativo; quando não
 * existir, devolve false e a tela mostra o passo a passo em texto —
 * preferimos dizer a verdade a fingir um botão que não faz nada.
 */
export async function abrirConfiguracoesDoApp(): Promise<boolean> {
  if (!isNativeApp()) return false;
  // Abrir as Configurações do sistema exige um plugin que o projeto ainda não
  // tem. Em vez de inventar dependência, olhamos o que estiver registrado e,
  // se não houver nada, devolvemos false para a tela mostrar o passo a passo.
  const plugins =
    (window as unknown as {
      Capacitor?: { Plugins?: Record<string, Record<string, (o?: unknown) => Promise<unknown>>> };
    }).Capacitor?.Plugins ?? {};
  const tentativas: Array<[string, string, unknown]> = [
    ["NativeSettings", "openAndroid", { option: "application_details" }],
    ["App", "openSettings", undefined],
    ["Diagnostic", "switchToSettings", undefined],
  ];
  for (const [nome, metodo, arg] of tentativas) {
    const fn = plugins[nome]?.[metodo];
    if (typeof fn === "function") {
      try {
        await fn(arg);
        return true;
      } catch {
        // tenta o próximo
      }
    }
  }
  return false;
}
