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

/**
 * Reconcilia a leitura nova com a que já tínhamos.
 *
 * BUG REAL (RC3 #1): o gate voltava a aparecer depois de trocar de aba, mesmo
 * com a permissão concedida. A causa não era o estado local — isso já tinha
 * sido corrigido. Era a fonte: dentro de um WebView, a Permissions API
 * responde pela permissão da ORIGEM WEB, que é uma coisa diferente da
 * permissão do sistema Android. Depois de o usuário conceder no diálogo do
 * Android, `navigator.permissions.query({name:"geolocation"})` ainda pode
 * responder `prompt`. Ao voltar para o app, o `visibilitychange` reconsultava,
 * recebia `prompt`, e o onboarding reaparecia por cima de uma permissão que
 * já existia.
 *
 * A regra que corrige isso de forma estrutural:
 *
 *   uma concessão confirmada só é revogada por evidência EXPLÍCITA de recusa.
 *
 * Ambiguidade (`perguntar`, `desconhecido`) nunca rebaixa. Recusa explícita
 * (`negada`, `negada_permanente`) sempre rebaixa — porque a pessoa pode ter
 * revogado nas Configurações, e esconder isso seria pior.
 *
 * A leitura nativa tem prioridade sobre a web: ela fala do sistema, que é o
 * que de fato manda no GPS.
 */
export function reconciliarLeitura(
  anterior: LeituraPermissao,
  nova: LeituraPermissao,
): LeituraPermissao {
  if (anterior.status !== "concedida") return nova;

  // Já estava concedida: só uma recusa explícita derruba.
  if (nova.status === "negada" || nova.status === "negada_permanente") return nova;
  if (nova.status === "indisponivel" && nova.origem === "nativo") return nova;

  // Qualquer outra coisa é ambiguidade — mantemos o que sabíamos.
  return anterior;
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
  const proxima = reconciliarLeitura(atual, leitura);
  if (proxima.status === atual.status && proxima.origem === atual.origem) return;
  atual = proxima;
  for (const assinante of assinantes) assinante(proxima);
}

/**
 * Escreve sem reconciliar. Usado só quando a evidência é de primeira mão —
 * um fix de GPS que voltou, ou o resultado do diálogo do sistema.
 */
export function definirLeituraDireta(leitura: LeituraPermissao): void {
  atual = leitura;
  for (const assinante of assinantes) assinante(leitura);
}

export function assinarPermissao(fn: (l: LeituraPermissao) => void): () => void {
  assinantes.add(fn);
  return () => {
    assinantes.delete(fn);
  };
}

/* ================================================================== *
 * Tempo limite
 *
 * BUG REAL (hotfix RC3): a Home ficava presa para sempre em "Verificando
 * permissões...". A causa não era lógica de permissão — era ausência de
 * tempo limite. `navigator.permissions.query({name:"geolocation"})` pode
 * NUNCA resolver: dentro de um iframe com Permissions-Policy bloqueando
 * geolocalização (é o caso do preview do Lovable), a promessa fica pendurada
 * em vez de rejeitar. Como o estado só saía de "desconhecido" quando o
 * `await` retornava, ele nunca saía — e "desconhecido" é justamente o que a
 * tela mostra como "verificando".
 *
 * `try/catch` não cobre promessa pendurada. Só tempo limite cobre.
 * ================================================================== */

export const LIMITE_DE_CONSULTA_MS = 2500;

/**
 * Tempo máximo do PEDIDO de permissão pelo caminho web.
 *
 * BUG REAL (RC3.2 #2): o botão ficava preso em "Solicitando..." para sempre.
 * A causa não era permissão: era `navigator.geolocation.getCurrentPosition`
 * que, dentro de um WebView/iframe com a geolocalização bloqueada por
 * Permissions-Policy, NÃO chama nem o sucesso nem o erro. O `timeout` das
 * opções só vale depois que o pedido começa; se ele nem começa, nenhum dos
 * dois callbacks roda e a promessa fica pendurada — e com ela o estado
 * "solicitando" da tela.
 *
 * Este limite é a rede de segurança: acima do `timeout` de 10 s das opções,
 * para não competir com ele, e finito.
 */
export const LIMITE_DE_PEDIDO_MS = 12000;

/** Resolve com `valorPadrao` se a promessa não responder a tempo. */
export function comTempoLimite<T>(promessa: Promise<T>, ms: number, valorPadrao: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let respondido = false;
    const cronometro = setTimeout(() => {
      if (respondido) return;
      respondido = true;
      resolve(valorPadrao);
    }, ms);
    void promessa
      .then((v) => {
        if (respondido) return;
        respondido = true;
        clearTimeout(cronometro);
        resolve(v);
      })
      .catch(() => {
        if (respondido) return;
        respondido = true;
        clearTimeout(cronometro);
        resolve(valorPadrao);
      });
  });
}

/**
 * Para onde ir quando a plataforma não respondeu.
 *
 * Nunca "desconhecido": esse estado trava a tela. Se já sabíamos que estava
 * concedida, mantemos — a mesma regra de não rebaixar por ambiguidade. Caso
 * contrário, "perguntar", que mostra um botão funcional em vez de um spinner.
 */
export function estadoQuandoNaoSabemos(anterior: LeituraPermissao): LeituraPermissao {
  if (anterior.status === "concedida") return { status: "concedida", origem: "cache" };
  return { status: "perguntar", origem: "nenhuma" };
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

function statusDoPlugin(estado: EstadoPlugin): StatusPermissao {
  if (estado.location === "granted" || estado.coarseLocation === "granted") return "concedida";
  return traduzirEstadoNativo(estado.location ?? estado.coarseLocation);
}

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
    // Capacitor returns a Proxy that synthesizes every method, including `then`.
    // Returning it directly from async would invoke native Geolocation.then().
    return {
      checkPermissions: () => Geolocation.checkPermissions(),
      requestPermissions: (options?: unknown) =>
        Geolocation.requestPermissions(
          options as Parameters<typeof Geolocation.requestPermissions>[0],
        ),
    };
  } catch {
    return null;
  }
}

/**
 * Estado real da permissão.
 *
 * GARANTIA DESTA FUNÇÃO: sempre resolve, e nunca com "desconhecido". Uma tela
 * que espera para sempre é pior que uma tela com o botão errado — o motoboy
 * pelo menos consegue tocar no botão.
 *
 * Os dois ambientes são tratados separadamente de propósito:
 *   ANDROID (Capacitor) → plugin nativo, que fala do sistema;
 *   NAVEGADOR           → Permissions API, que fala da origem web.
 * Nenhum dos dois é obrigatório: faltando os dois, caímos em "perguntar".
 */
export async function consultarPermissao(): Promise<LeituraPermissao> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    const leitura: LeituraPermissao = { status: "indisponivel", origem: "nenhuma" };
    definirLeitura(leitura);
    return leitura;
  }

  const anterior = atual;

  // ---- Android nativo ----
  if (isNativeApp()) {
    const status = await comTempoLimite(
      (async (): Promise<StatusPermissao> => {
        const nativo = await pluginGeolocation();
        if (!nativo) return "desconhecido";
        const r = await nativo.checkPermissions();
        return statusDoPlugin(r);
      })(),
      LIMITE_DE_CONSULTA_MS,
      "desconhecido",
    );
    if (status !== "desconhecido") {
      const leitura: LeituraPermissao = { status, origem: "nativo" };
      definirLeitura(leitura);
      return leitura;
    }
    // Plugin ausente ou sem resposta: continua para o caminho web abaixo, que
    // no WebView também funciona.
  }

  return consultarPermissaoWeb(anterior);
}

async function consultarPermissaoWeb(anterior: LeituraPermissao): Promise<LeituraPermissao> {
  // ---- Navegador ----
  const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (perms?.query) {
    const resultado = await comTempoLimite(
      perms
        .query({ name: "geolocation" as PermissionName })
        .then((s) => s as PermissionStatus | null),
      LIMITE_DE_CONSULTA_MS,
      null,
    );
    if (resultado) {
      const traduzido = traduzirEstadoWeb(resultado.state);
      if (traduzido !== "desconhecido") {
        const leitura: LeituraPermissao = { status: traduzido, origem: "web" };
        definirLeitura(leitura);
        resultado.onchange = () => {
          definirLeitura({ status: traduzirEstadoWeb(resultado.state), origem: "web" });
        };
        return leitura;
      }
    }
  }

  // ---- Não deu para determinar ----
  const leitura = estadoQuandoNaoSabemos(anterior);
  definirLeitura(leitura);
  return leitura;
}

export async function pedirPermissao(): Promise<LeituraPermissao> {
  if (isNativeApp()) {
    // Consultar não depende de um fix: uma autorização existente libera a tela.
    const nativo = await comTempoLimite(pluginGeolocation(), LIMITE_DE_CONSULTA_MS, null);
    const existente = nativo
      ? await comTempoLimite(nativo.checkPermissions(), LIMITE_DE_CONSULTA_MS, null)
      : null;
    if (nativo && existente) {
      if (statusDoPlugin(existente) === "concedida") {
        const leitura: LeituraPermissao = { status: "concedida", origem: "nativo" };
        definirLeituraDireta(leitura);
        return leitura;
      }
      const status = await comTempoLimite(
        (async (): Promise<StatusPermissao> => {
          const r = await nativo.requestPermissions({
            permissions: ["location", "coarseLocation"],
          });
          const status = statusDoPlugin(r);
          if (status !== "desconhecido") definirLeituraDireta({ status, origem: "nativo" });
          return status;
        })(),
        // A response arriving during the bounded web fallback still updates the permission.
        15000,
        "desconhecido",
      );
      if (status !== "desconhecido") {
        const leitura: LeituraPermissao = { status, origem: "nativo" };
        definirLeituraDireta(leitura);
        return leitura;
      }
    }
    // Unknown bridge state is not a denial. Keep the bounded WebView fallback
    // without consulting the same failed native bridge a second time.
  }

  const existente = isNativeApp() ? await consultarPermissaoWeb(atual) : await consultarPermissao();
  if (existente.status === "concedida") return existente;

  let encerrado = false;
  let cancelarEscuta = () => {};
  const pedidoWeb = new Promise<LeituraPermissao>((resolve) => {
    cancelarEscuta = assinarPermissao((leitura) => {
      // A Permissions API pode confirmar antes de o GPS conseguir um fix.
      if (!encerrado && leitura.status === "concedida") {
        encerrado = true;
        resolve(leitura);
      }
    });
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const leitura: LeituraPermissao = { status: "indisponivel", origem: "nenhuma" };
      definirLeitura(leitura);
      resolve(leitura);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        if (encerrado) return;
        // Uma posição voltou: é a prova mais forte que existe de que a
        // permissão está de pé. Entra sem reconciliação.
        const leitura: LeituraPermissao = { status: "concedida", origem: "web" };
        definirLeituraDireta(leitura);
        resolve(leitura);
      },
      (err) => {
        if (encerrado) return;
        const leitura: LeituraPermissao = {
          status: traduzirErroDeGps(err.code, err.PERMISSION_DENIED),
          origem: "web",
        };
        definirLeituraDireta(leitura);
        resolve(leitura);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
    );
  });

  // Se a plataforma não responder, saímos do "solicitando" com um estado que
  // tem botão funcional. Nunca ficamos presos.
  const resultado = await comTempoLimite(pedidoWeb, LIMITE_DE_PEDIDO_MS, null);
  encerrado = true;
  cancelarEscuta();
  if (resultado) return resultado;
  const desistencia = estadoQuandoNaoSabemos(atual);
  definirLeituraDireta(desistencia);
  return desistencia;
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
    (
      window as unknown as {
        Capacitor?: { Plugins?: Record<string, Record<string, (o?: unknown) => Promise<unknown>>> };
      }
    ).Capacitor?.Plugins ?? {};
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
