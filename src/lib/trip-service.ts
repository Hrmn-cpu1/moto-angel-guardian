import { isNativeApp } from "./native.ts";

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
  atualizar: (o: { destino?: string; alerta?: string; distancia?: string }) => Promise<{ ativo: boolean }>;
  parar: () => Promise<{ ativo: boolean }>;
  addListener: (
    evento: string,
    cb: (p: PosicaoNativa) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

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
    await p.iniciar({ destino: destino ?? "" });
    return true;
  } catch {
    // Falhar aqui não pode derrubar a viagem: ela continua em primeiro plano.
    return false;
  }
}

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
      if (!cancelado) cb(pos);
    })
    .then((h) => {
      if (cancelado) void h.remove();
      else remover = h.remove;
    })
    .catch(() => {});
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
