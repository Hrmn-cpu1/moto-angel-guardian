import { isNativeApp } from "./native.ts";
import { recordTripDiagnostic, setTripDiagnosticState } from "./trip-diagnostics.ts";

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

type PluginViagem = {
  iniciar: (o: { destino?: string }) => Promise<{ ativo: boolean }>;
  atualizar: (o: {
    destino?: string;
    alerta?: string;
    distancia?: string;
  }) => Promise<{ ativo: boolean }>;
  parar: () => Promise<{ ativo: boolean }>;
  addListener: (
    evento: string,
    cb: (p: PosicaoNativa) => void,
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
  return plugin() !== null;
}

export async function iniciarServicoDeViagem(destino?: string): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    setTripDiagnosticState({ action: "native_trip_service_start" });
    await p.iniciar({ destino: destino ?? "" });
    return true;
  } catch (error) {
    console.error(TRIP_NATIVE_ERROR, recordTripDiagnostic("native.trip.start", error));
    // Falhar aqui não pode derrubar a viagem: ela continua em primeiro plano.
    return false;
  }
}

const TRIP_NATIVE_ERROR = "Moto Anjo native trip service error";

export async function atualizarServicoDeViagem(dados: {
  destino?: string;
  alerta?: string;
  distancia?: string;
}): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.atualizar(dados);
  } catch {
    /* a notificação continua com o texto anterior */
  }
}

export async function pararServicoDeViagem(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.parar();
  } catch {
    /* nada a fazer: o serviço também morre com stopWithTask */
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
  let remover: (() => Promise<void>) | null = null;
  let cancelado = false;
  void p
    .addListener("posicao", (pos) => {
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
        console.error(TRIP_NATIVE_ERROR, recordTripDiagnostic("native.trip.position_callback", error));
      }
    })
    .then((h) => {
      if (cancelado) void h.remove();
      else remover = h.remove;
    })
    .catch((error) => {
      console.error(TRIP_NATIVE_ERROR, recordTripDiagnostic("native.trip.listener", error));
    });
  return () => {
    cancelado = true;
    if (remover) void remover();
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
