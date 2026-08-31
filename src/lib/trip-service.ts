import { isNativeApp } from "./native.ts";
import {
  recordTripDiagnostic,
  registrarEventoDeViagem,
  setTripDiagnosticState,
} from "./trip-diagnostics.ts";

/**
 * Ponte para o serviço nativo da Viagem Segura.
 *
 * O serviço mantém o processo vivo enquanto a viagem está ativa e mostra a
 * notificação persistente — que é o que aparece na tela de bloqueio pelo
 * caminho oficial do Android. Fora do aparelho (navegador), tudo aqui é
 * silenciosamente inerte: a viagem continua funcionando, só sem o serviço.
 *
 * Sem estado próprio de propósito. A verdade sobre a viagem mora em
 * `src/lib/trip.ts`; aqui só refletimos.
 */

/** Posição vinda do serviço nativo. */
export interface PosicaoNativa {
  lat: number;
  lng: number;
  /** Metros. -1 quando o provedor não informou. */
  precisaoM: number;
  /** m/s. -1 quando o provedor não informou. */
  velocidadeMs: number;
  quandoMs: number;
}

/**
 * Motivo publicado pelo Android. Os quatro primeiros vêm de
 * `ViagemSeguraService`; os dois últimos nascem aqui, quando nem chegamos a
 * falar com o serviço.
 */
/**
 * Amostra de movimento vinda do serviço nativo (P0.1b).
 *
 * `monotonicoMs` é `SystemClock.elapsedRealtime`: não anda para trás com
 * ajuste de fuso/NTP, que é o que a janela de detecção precisa. `quandoMs` é
 * relógio de parede e serve só para log.
 */
export interface MovimentoNativoAmostra {
  /** m/s² lineares. -1 quando o aparelho não informou. */
  accelMs2: number;
  /** graus/s. -1 quando não há giroscópio. */
  gyroDegS: number;
  monotonicoMs: number;
  quandoMs: number;
}

/** O que o aparelho realmente tem. Sem acelerômetro não há detecção. */
export interface SensoresNativos {
  aceleracao: boolean;
  giroscopio: boolean;
  capturando: boolean;
}

export interface EventoDiagnosticoLock {
  evento: string;
  quandoMs: number;
}

export interface DiagnosticoLock {
  disponivel: boolean;
  eventos: EventoDiagnosticoLock[];
}

export const SENSORES_NATIVOS_AUSENTES: SensoresNativos = {
  aceleracao: false,
  giroscopio: false,
  capturando: false,
};

export type MotivoServico =
  | "ativo"
  | "parado"
  | "sem_permissao_localizacao"
  | "sem_permissao_notificacao"
  | "falha_ao_iniciar"
  | "sem_plugin";

/**
 * Estado REAL do serviço de primeiro plano.
 *
 * `ativo` e `notificacaoVisivel` são perguntas diferentes de propósito: no
 * Android 13+ o serviço pode estar rodando com a notificação bloqueada, e é
 * justamente esse caso que a tela precisa contar em vez de esconder.
 */
export interface EstadoServicoViagem {
  ativo: boolean;
  notificacaoVisivel: boolean;
  motivo: MotivoServico;
  /** O app chegou a pedir o início nesta transição. */
  solicitado: boolean;
}

export interface PermissaoNotificacao {
  /** Android 13+: existe diálogo a ser mostrado. */
  suportaRuntime: boolean;
  concedida: boolean;
  /** Concedida E canal ligado nas configurações do sistema. */
  podeMostrar: boolean;
}

/** O que a notificação da viagem deve mostrar. Ver `montarAtualizacaoDaViagem`. */
export interface AtualizacaoDeViagem {
  /** Ausente = mantém o que o serviço já sabe. Nunca mandamos destino vazio. */
  destino?: string;
  alerta: string;
  distancia: string;
  manobra: string;
}

type PluginViagem = {
  iniciar: (o: { destino?: string }) => Promise<Partial<EstadoServicoViagem>>;
  atualizar: (o: AtualizacaoDeViagem) => Promise<Partial<EstadoServicoViagem>>;
  parar: () => Promise<Partial<EstadoServicoViagem>>;
  consultarEstado?: () => Promise<Partial<EstadoServicoViagem>>;
  navegacaoBloqueada?: (q: QuadroNavegacaoBloqueada) => Promise<void>;
  limparNavegacaoBloqueada?: () => Promise<void>;
  diagnosticoLock?: () => Promise<Partial<DiagnosticoLock>>;
  limparDiagnosticoLock?: () => Promise<void>;
  estadoSensores?: () => Promise<Partial<SensoresNativos>>;
  permissaoNotificacao?: () => Promise<Partial<PermissaoNotificacao>>;
  pedirPermissaoNotificacao?: () => Promise<Partial<PermissaoNotificacao>>;
  addListener: (
    evento: string,
    cb: (dados: PosicaoNativa & Partial<EstadoServicoViagem>) => void,
  ) => ListenerHandle | Promise<ListenerHandle>;
};

/**
 * Handle devolvido pelo `addListener`.
 *
 * O Capacitor 7 devolve o handle SÍNCRONO nos plugins nativos e uma Promise em
 * implementações web/legadas. Tratar sempre como Promise (`.then`) explode com
 * `addListener(...).then is not a function` — foi exatamente o que derrubou a
 * Home ao iniciar a viagem.
 */
export interface ListenerHandle {
  remove: () => void | Promise<void>;
}

/** Normaliza o retorno do `addListener` para os dois contratos possíveis. */
export async function normalizarHandle(
  resultado: ListenerHandle | Promise<ListenerHandle>,
): Promise<ListenerHandle> {
  const talvezPromise = resultado as { then?: unknown } | null;
  if (talvezPromise && typeof talvezPromise.then === "function") {
    return await (resultado as Promise<ListenerHandle>);
  }
  return resultado as ListenerHandle;
}

function plugin(): PluginViagem | null {
  if (!isNativeApp() || typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, PluginViagem> } })
    .Capacitor;
  return cap?.Plugins?.ViagemSegura ?? null;
}

/** O serviço existe neste aparelho? A interface usa para não prometer nada. */
export function servicoDisponivel(): boolean {
  if (typeof window === "undefined") return false;
  return plugin() !== null;
}

/** O botão do Perfil usa isto para sumir completamente fora do APK debug. */
export async function lerDiagnosticoLock(): Promise<DiagnosticoLock> {
  const p = plugin();
  if (!p?.diagnosticoLock) return { disponivel: false, eventos: [] };
  try {
    const r = await p.diagnosticoLock();
    const eventos = Array.isArray(r.eventos)
      ? r.eventos.filter(
          (item): item is EventoDiagnosticoLock =>
            typeof item?.evento === "string" && Number.isFinite(item.quandoMs),
        )
      : [];
    return { disponivel: r.disponivel === true, eventos: eventos.slice(-50) };
  } catch {
    return { disponivel: false, eventos: [] };
  }
}

export async function limparDiagnosticoLock(): Promise<void> {
  const p = plugin();
  if (!p?.limparDiagnosticoLock) return;
  try {
    await p.limparDiagnosticoLock();
  } catch {
    // Diagnóstico não pode interferir na viagem.
  }
}

const TRIP_NATIVE_ERROR = "Moto Anjo native trip service error";

export const SERVICO_INICIAL: EstadoServicoViagem = {
  ativo: false,
  notificacaoVisivel: false,
  motivo: "parado",
  solicitado: false,
};

/* ================================================================== *
 * Espelho do estado do serviço
 *
 * Isto NÃO é uma segunda fonte de verdade da viagem — essa continua sendo
 * `trip.ts`. É a última resposta do Android sobre o serviço dele, guardada
 * para a tela poder dizer o que está acontecendo sem perguntar de novo.
 * ================================================================== */

let estadoDoServico: EstadoServicoViagem = { ...SERVICO_INICIAL };
const assinantesDeEstado = new Set<(e: EstadoServicoViagem) => void>();

export function estadoAtualDoServico(): EstadoServicoViagem {
  return estadoDoServico;
}

export function assinarEstadoDoServico(cb: (e: EstadoServicoViagem) => void): () => void {
  assinantesDeEstado.add(cb);
  return () => {
    assinantesDeEstado.delete(cb);
  };
}

const MOTIVOS: MotivoServico[] = [
  "ativo",
  "parado",
  "sem_permissao_localizacao",
  "sem_permissao_notificacao",
  "falha_ao_iniciar",
  "sem_plugin",
];

/** Normaliza o que veio do Java e avisa quem estiver ouvindo. */
function publicarEstadoDoServico(bruto: Partial<EstadoServicoViagem>): EstadoServicoViagem {
  const motivo = MOTIVOS.includes(bruto.motivo as MotivoServico)
    ? (bruto.motivo as MotivoServico)
    : "parado";
  estadoDoServico = {
    ativo: bruto.ativo === true,
    notificacaoVisivel: bruto.notificacaoVisivel === true,
    motivo,
    solicitado: bruto.solicitado === true,
  };
  for (const a of assinantesDeEstado) a(estadoDoServico);
  registrarEventoDeViagem(
    estadoDoServico.ativo ? "trip.native.status.active" : "trip.native.status.failed",
    {
      detalhe: estadoDoServico.motivo,
    },
  );
  return estadoDoServico;
}

/** Frase curta para a tela. Pura: o texto é testado sem Android. */
export function descricaoDoServico(e: EstadoServicoViagem): string {
  if (e.ativo && e.notificacaoVisivel) return "Proteção em segundo plano ativa";
  if (e.ativo) return "Rodando sem aviso na tela — notificações desligadas";
  switch (e.motivo) {
    case "sem_permissao_localizacao":
      return "Sem permissão de localização para o segundo plano";
    case "sem_permissao_notificacao":
      return "Notificações desligadas: sem aviso na tela de bloqueio";
    case "falha_ao_iniciar":
      return "O Android recusou iniciar o segundo plano";
    case "sem_plugin":
      return "Segundo plano indisponível neste dispositivo";
    default:
      return "Segundo plano inativo";
  }
}

/* ================================================================== *
 * Permissão de notificação (Android 13+)
 * ================================================================== */

/**
 * Pede POST_NOTIFICATIONS antes de subir o serviço.
 *
 * Sem isto a notificação da viagem nasce bloqueada no Android 13+ e a tela de
 * bloqueio fica vazia — o serviço roda, e o usuário não vê nada. Negar não é
 * erro: a viagem continua, só sem o aviso permanente.
 */
export async function pedirPermissaoDeNotificacao(): Promise<PermissaoNotificacao> {
  const p = plugin();
  if (!p?.pedirPermissaoNotificacao) {
    return { suportaRuntime: false, concedida: false, podeMostrar: false };
  }
  try {
    const r = await p.pedirPermissaoNotificacao();
    return {
      suportaRuntime: r?.suportaRuntime === true,
      concedida: r?.concedida === true,
      podeMostrar: r?.podeMostrar === true,
    };
  } catch (error) {
    recordTripDiagnostic("native.trip.notification_permission", error);
    return { suportaRuntime: false, concedida: false, podeMostrar: false };
  }
}

export async function consultarPermissaoDeNotificacao(): Promise<PermissaoNotificacao> {
  const p = plugin();
  if (!p?.permissaoNotificacao) {
    return { suportaRuntime: false, concedida: false, podeMostrar: false };
  }
  try {
    const r = await p.permissaoNotificacao();
    return {
      suportaRuntime: r?.suportaRuntime === true,
      concedida: r?.concedida === true,
      podeMostrar: r?.podeMostrar === true,
    };
  } catch {
    return { suportaRuntime: false, concedida: false, podeMostrar: false };
  }
}

/* ================================================================== *
 * Ciclo de vida do serviço
 * ================================================================== */

/**
 * Sobe o serviço e devolve o estado REAL, nunca um otimismo.
 *
 * Antes esta função devolvia `true` assim que o Intent era despachado, e o
 * plugin respondia `{ativo:true}` mesmo quando o Android recusava — o app
 * anunciava proteção inexistente. Agora o retorno é o que o serviço disse,
 * e o motivo viaja junto.
 */
export async function iniciarServicoDeViagem(destino?: string): Promise<EstadoServicoViagem> {
  const p = plugin();
  registrarEventoDeViagem("trip.native.start.begin");
  if (!p) {
    registrarEventoDeViagem("trip.native.start.fail", { detalhe: "sem_plugin" });
    return publicarEstadoDoServico({ motivo: "sem_plugin" });
  }
  const comecou = Date.now();
  try {
    setTripDiagnosticState({ action: "native_trip_service_start" });
    // A permissão precisa vir ANTES do startForeground: pedir depois deixaria
    // a primeira viagem sem notificação nenhuma.
    await pedirPermissaoDeNotificacao();
    const r = await p.iniciar({ destino: destino ?? "" });
    const estado = publicarEstadoDoServico(r ?? {});
    if (!estado.ativo && estado.motivo !== "ativo") {
      registrarEventoDeViagem("trip.native.start.fail", {
        detalhe: estado.motivo,
        duracaoMs: Date.now() - comecou,
      });
      recordTripDiagnostic("native.trip.start_recusado", new Error(estado.motivo));
    } else {
      registrarEventoDeViagem("trip.native.start.success", { duracaoMs: Date.now() - comecou });
    }
    return estado;
  } catch (error) {
    registrarEventoDeViagem("trip.native.start.fail", {
      detalhe: "excecao",
      duracaoMs: Date.now() - comecou,
    });
    console.error(TRIP_NATIVE_ERROR, recordTripDiagnostic("native.trip.start", error));
    // Falhar aqui não pode derrubar a viagem: ela continua em primeiro plano.
    return publicarEstadoDoServico({ motivo: "falha_ao_iniciar" });
  }
}

/**
 * Monta a atualização da notificação.
 *
 * Pura, e é aqui que mora a correção do bug do destino: um campo que não
 * conhecemos NÃO vai no objeto, e o Android mantém o valor anterior. Alerta e
 * manobra são transitórios, então vão sempre — inclusive vazios, que é como
 * se limpa. Nada é preenchido por estética: sem manobra, `manobra` é "".
 */
export function montarAtualizacaoDaViagem(entrada: {
  destino?: string | null;
  alerta?: string | null;
  distanciaDoAlerta?: string | null;
  manobra?: string | null;
  distanciaDaManobra?: string | null;
}): AtualizacaoDeViagem {
  const limpo = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : "");
  const alerta = limpo(entrada.alerta);
  const destino = limpo(entrada.destino);
  const manobra = limpo(entrada.manobra);
  const distanciaDaManobra = limpo(entrada.distanciaDaManobra);

  const saida: AtualizacaoDeViagem = {
    alerta,
    // Distância solta não diz nada: só acompanha o alerta que a gerou.
    distancia: alerta ? limpo(entrada.distanciaDoAlerta) : "",
    // Distância sem instrução também não: a manobra é a instrução.
    manobra: manobra ? (distanciaDaManobra ? `${distanciaDaManobra} · ${manobra}` : manobra) : "",
  };
  if (destino) saida.destino = destino;
  return saida;
}

export async function atualizarServicoDeViagem(dados: AtualizacaoDeViagem): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    const r = await p.atualizar(dados);
    if (r) publicarEstadoDoServico(r);
  } catch {
    /* a notificação continua com o texto anterior */
  }
}

export async function pararServicoDeViagem(): Promise<void> {
  const p = plugin();
  if (!p) {
    publicarEstadoDoServico({ motivo: "parado" });
    return;
  }
  try {
    const r = await p.parar();
    publicarEstadoDoServico(r ?? { motivo: "parado" });
  } catch {
    /* nada a fazer: o serviço também morre com stopWithTask */
    publicarEstadoDoServico({ motivo: "parado" });
  }
}

/** Relê o estado do Android — usado quando o app volta do segundo plano. */
export async function consultarEstadoDoServico(): Promise<EstadoServicoViagem> {
  const p = plugin();
  if (!p?.consultarEstado) return estadoDoServico;
  try {
    return publicarEstadoDoServico((await p.consultarEstado()) ?? {});
  } catch {
    return estadoDoServico;
  }
}

/**
 * Escuta as posições do serviço nativo.
 *
 * Existe porque manter o processo vivo NÃO garante que `navigator.geolocation`
 * continue entregando posição com a tela apagada — o Android pode suspender a
 * WebView mesmo com o processo de pé. Fora do aparelho devolve um cancelador
 * vazio e a camada web segue como está.
 *
 * Não guarda estado: só entrega o que chegou a quem chamou.
 */
export function ouvirPosicaoNativa(cb: (p: PosicaoNativa) => void): () => void {
  const p = plugin();
  if (!p?.addListener) return () => {};
  let handle: ListenerHandle | null = null;
  let cancelado = false;
  const aoReceber = (pos: PosicaoNativa) => {
    if (cancelado) return;
    if (
      !pos ||
      typeof pos.lat !== "number" ||
      typeof pos.lng !== "number" ||
      typeof pos.precisaoM !== "number" ||
      typeof pos.velocidadeMs !== "number"
    ) {
      console.error(
        TRIP_NATIVE_ERROR,
        recordTripDiagnostic("native.trip.position_payload", new Error("Invalid native payload")),
      );
      return;
    }
    try {
      cb(pos);
    } catch (error) {
      console.error(
        TRIP_NATIVE_ERROR,
        recordTripDiagnostic("native.trip.position_callback", error),
      );
    }
  };

  // O registro é feito dentro de uma async IIFE com try/catch: `addListener`
  // pode lançar de forma SÍNCRONA (plugin ausente/incompatível) e esse throw
  // subiria até o boundary raiz, derrubando a Home no início da viagem.
  void (async () => {
    try {
      const h = await normalizarHandle(p.addListener("posicao", aoReceber));
      if (!h || typeof h.remove !== "function") {
        recordTripDiagnostic("native.trip.listener", new Error("Invalid listener handle"));
        return;
      }
      if (cancelado) await h.remove();
      else handle = h;
    } catch (error) {
      console.error(TRIP_NATIVE_ERROR, recordTripDiagnostic("native.trip.listener", error));
    }
  })();

  return () => {
    cancelado = true;
    const h = handle;
    handle = null;
    if (!h) return;
    try {
      void Promise.resolve(h.remove()).catch((error) => {
        recordTripDiagnostic("native.trip.listener_remove", error);
      });
    } catch (error) {
      recordTripDiagnostic("native.trip.listener_remove", error);
    }
  };
}

/**
 * Escuta o movimento capturado pelo SERVIÇO (não pela WebView).
 *
 * Esta é a razão de existir do P0.1b: `devicemotion` morre junto com a
 * WebView suspensa, e a queda que importa acontece justamente com a tela
 * apagada. Aqui a origem é o `SensorEventListener` registrado dentro do
 * foreground service, com o mesmo ciclo de vida da viagem.
 *
 * Fora do aparelho devolve um cancelador vazio — e o chamador continua com o
 * `devicemotion` como está hoje.
 */
export function ouvirMovimentoNativo(cb: (m: MovimentoNativoAmostra) => void): () => void {
  const p = plugin();
  if (!p?.addListener) return () => {};
  let handle: ListenerHandle | null = null;
  let cancelado = false;

  const aoReceber = (bruto: Partial<MovimentoNativoAmostra>) => {
    if (cancelado || !bruto) return;
    if (typeof bruto.accelMs2 !== "number" || typeof bruto.monotonicoMs !== "number") {
      recordTripDiagnostic("native.motion.payload", new Error("Invalid native motion payload"));
      return;
    }
    try {
      cb({
        accelMs2: bruto.accelMs2,
        gyroDegS: typeof bruto.gyroDegS === "number" ? bruto.gyroDegS : -1,
        monotonicoMs: bruto.monotonicoMs,
        quandoMs: typeof bruto.quandoMs === "number" ? bruto.quandoMs : Date.now(),
      });
    } catch (error) {
      recordTripDiagnostic("native.motion.callback", error);
    }
  };

  void (async () => {
    try {
      const h = await normalizarHandle(
        p.addListener(
          "movimento",
          aoReceber as unknown as (dados: PosicaoNativa & Partial<EstadoServicoViagem>) => void,
        ),
      );
      if (!h || typeof h.remove !== "function") return;
      if (cancelado) await h.remove();
      else handle = h;
    } catch (error) {
      recordTripDiagnostic("native.motion.listener", error);
    }
  })();

  return () => {
    cancelado = true;
    const h = handle;
    handle = null;
    if (!h) return;
    try {
      void Promise.resolve(h.remove()).catch((error) => {
        recordTripDiagnostic("native.motion.listener_remove", error);
      });
    } catch (error) {
      recordTripDiagnostic("native.motion.listener_remove", error);
    }
  };
}

/** Pergunta ao Android o que existe de verdade. Nunca lança. */
export async function consultarSensoresNativos(): Promise<SensoresNativos> {
  const p = plugin();
  if (!p?.estadoSensores) return SENSORES_NATIVOS_AUSENTES;
  try {
    const r = (await p.estadoSensores()) ?? {};
    return {
      aceleracao: r.aceleracao === true,
      giroscopio: r.giroscopio === true,
      capturando: r.capturando === true,
    };
  } catch (error) {
    recordTripDiagnostic("native.motion.state", error);
    return SENSORES_NATIVOS_AUSENTES;
  }
}

/**
 * Escuta o estado real do serviço.
 *
 * Mesma defesa do `ouvirPosicaoNativa` — e escrito separado de propósito: o
 * caminho da posição é o hotfix P0 validado, e não vai ser refatorado para
 * economizar vinte linhas.
 */
export function ouvirEstadoDoServico(cb: (e: EstadoServicoViagem) => void): () => void {
  const p = plugin();
  if (!p?.addListener) return () => {};
  let handle: ListenerHandle | null = null;
  let cancelado = false;

  const aoReceber = (bruto: Partial<EstadoServicoViagem>) => {
    if (cancelado || !bruto) return;
    try {
      cb(publicarEstadoDoServico(bruto));
    } catch (error) {
      recordTripDiagnostic("native.trip.state_callback", error);
    }
  };

  void (async () => {
    try {
      const h = await normalizarHandle(p.addListener("estado", aoReceber));
      if (!h || typeof h.remove !== "function") return;
      if (cancelado) await h.remove();
      else handle = h;
    } catch (error) {
      recordTripDiagnostic("native.trip.state_listener", error);
    }
  })();

  return () => {
    cancelado = true;
    const h = handle;
    handle = null;
    if (!h) return;
    try {
      void Promise.resolve(h.remove()).catch((error) => {
        recordTripDiagnostic("native.trip.state_listener_remove", error);
      });
    } catch (error) {
      recordTripDiagnostic("native.trip.state_listener_remove", error);
    }
  };
}

/**
 * Quando o serviço deve estar de pé.
 *
 * Puro, para o teste provar a regra sem Android: **só com viagem ativa**.
 * Nunca no boot, nunca ao abrir o mapa, nunca durante a preparação.
 */
export function servicoDeveEstarAtivo(estadoDaViagem: string): boolean {
  return estadoDaViagem === "ativa";
}

/* ================================================================== *
 * P0.1c — Ponte da navegação na tela de bloqueio
 *
 * Só transporte. O quadro é montado (e higienizado) em
 * `src/lib/lock-navigation.ts`, a partir da MESMA viagem, da MESMA rota e do
 * MESMO GPS que o cockpit usa. Nada aqui cria estado.
 * ================================================================== */

/** Quadro publicado para o Android. Sem nome, e-mail, telefone ou contatos. */
export interface QuadroNavegacaoBloqueada {
  ativa: boolean;
  /** Preferência do usuário: "Mostrar navegação na tela bloqueada". */
  permitida: boolean;
  manobra: string;
  distanciaManobra: string;
  destino: string;
  restante: string;
  eta: string;
  risco: string;
  lat: number;
  lng: number;
  /** Pares lat,lng já reduzidos: [lat0, lng0, lat1, lng1, ...]. */
  rota: number[];
}

export async function publicarNavegacaoBloqueada(q: QuadroNavegacaoBloqueada): Promise<void> {
  const p = plugin();
  if (!p?.navegacaoBloqueada) return;
  try {
    await p.navegacaoBloqueada(q);
  } catch (error) {
    recordTripDiagnostic("native.lock_navigation.publish", error);
  }
}

export async function limparNavegacaoBloqueada(): Promise<void> {
  const p = plugin();
  if (!p?.limparNavegacaoBloqueada) return;
  try {
    await p.limparNavegacaoBloqueada();
  } catch (error) {
    recordTripDiagnostic("native.lock_navigation.clear", error);
  }
}

/**
 * SOS pedido na tela de bloqueio.
 *
 * O Android só avisa; quem dispara é o controlador de SOS que já existe. É
 * isto que impede um segundo pipeline de emergência.
 */
export function ouvirSosDaTelaBloqueada(cb: () => void): () => void {
  const p = plugin();
  if (!p?.addListener) return () => {};
  let handle: ListenerHandle | null = null;
  let cancelado = false;

  const aoReceber = () => {
    if (cancelado) return;
    try {
      cb();
    } catch (error) {
      recordTripDiagnostic("native.lock_navigation.sos_callback", error);
    }
  };

  void (async () => {
    try {
      const h = await normalizarHandle(
        p.addListener(
          "sosTelaBloqueada",
          aoReceber as unknown as Parameters<PluginViagem["addListener"]>[1],
        ),
      );
      if (!h || typeof h.remove !== "function") return;
      if (cancelado) await h.remove();
      else handle = h;
    } catch (error) {
      recordTripDiagnostic("native.lock_navigation.sos_listener", error);
    }
  })();

  return () => {
    cancelado = true;
    const h = handle;
    handle = null;
    if (!h) return;
    try {
      void Promise.resolve(h.remove()).catch((error) => {
        recordTripDiagnostic("native.lock_navigation.sos_listener_remove", error);
      });
    } catch (error) {
      recordTripDiagnostic("native.lock_navigation.sos_listener_remove", error);
    }
  };
}
