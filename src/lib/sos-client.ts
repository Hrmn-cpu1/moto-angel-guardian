/**
 * Núcleo do SOS no lado do cliente.
 *
 * Este módulo é PURO de propósito: nenhuma dependência de React, nenhum import
 * relativo e nenhum acesso obrigatório ao DOM. Isso permite que ele seja
 * exercitado por `node --test` sem bundler e que os três acionadores
 * (SosFab, MapSosButton e a rota /sos) compartilhem exatamente as mesmas regras.
 *
 * Regra editorial que atravessa o arquivo inteiro: o app nunca afirma que uma
 * mensagem foi ENTREGUE. Abrir o wa.me não prova nada. A API do WhatsApp
 * aceitar o envio também não prova nada. Só existe um estado de entrega, e ele
 * depende de um webhook de status do provedor gravar `delivered` no banco.
 */

/* ------------------------------------------------------------------ *
 * Regras documentadas do acionamento
 * ------------------------------------------------------------------ */

/** Tempo de pressão contínua exigido para armar o SOS, em milissegundos. */
export const SOS_HOLD_MS = 3000;

/**
 * Idade máxima aceita para o fix de GPS, em milissegundos.
 *
 * Um SOS precisa de onde a pessoa ESTÁ, não de onde ela passou. Uma moto a
 * 60 km/h percorre 1 km por minuto: um fix de 60 s já pode apontar um
 * quarteirão errado. Acima disso o acionamento é recusado e um novo fix é
 * pedido, em vez de registrar uma posição que o resgate não vai encontrar.
 */
export const SOS_MAX_FIX_AGE_MS = 60_000;

/**
 * Precisão máxima aceita, em metros (raio informado pelo aparelho).
 *
 * 500 m delimita mais ou menos um bairro — é o pior caso ainda útil para
 * alguém sair procurando. Acima disso normalmente é posição de torre de
 * celular ou de Wi-Fi, e mandar isso para um contato de emergência é pior do
 * que admitir que não há posição confiável.
 */
export const SOS_MAX_ACCURACY_M = 500;

/**
 * Acima deste valor o fix é aceito, mas marcado como degradado: a interface
 * mostra o aviso e a mensagem sai com a ressalva do raio de erro.
 */
export const SOS_WARN_ACCURACY_M = 100;

/** Janela em que um novo acionamento é tratado como toque repetido. */
export const SOS_COOLDOWN_MS = 15_000;

/** Velocidade fisicamente impossível para uma moto; indica fix forjado. */
export const SOS_IMPOSSIBLE_SPEED_MS = 120; // ~432 km/h

/** Depois disso, um SOS guardado localmente é considerado sucata e ignorado. */
export const SOS_LOCAL_TTL_MS = 6 * 60 * 60 * 1000;

/** Chave usada para sobreviver a um F5 ou a uma troca de tela. */
export const SOS_STORAGE_KEY = "moto-anjo:sos-ativo";

/* ------------------------------------------------------------------ *
 * request_id — idempotência
 * ------------------------------------------------------------------ */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function getCrypto(): CryptoLike | null {
  const g = globalThis as unknown as { crypto?: CryptoLike };
  return g.crypto ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Verdadeiro apenas para UUID RFC 4122 das versões 1 a 5. */
export function isValidUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Gera o identificador que torna o acionamento idempotente.
 *
 * O mesmo request_id reenviado ao servidor devolve o MESMO sos_event em vez de
 * abrir um segundo. É o que protege contra retry de rede, duplo toque que
 * escapou do lock e reenvio depois de recuperar a conexão.
 */
export function newRequestId(): string {
  const c = getCrypto();
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/* ------------------------------------------------------------------ *
 * Validação do fix de GPS
 * ------------------------------------------------------------------ */

export interface RawFix {
  lat: unknown;
  lng: unknown;
  accuracy?: number | null;
  /** Epoch em milissegundos do momento em que o aparelho fixou a posição. */
  timestamp?: number | null;
  speed?: number | null;
  /** Android/Capacitor expõem isto quando a posição vem de um app de mock. */
  mocked?: boolean | null;
  isFromMockProvider?: boolean | null;
}

export interface SosFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  ageMs: number;
  /** Aceito, porém impreciso o bastante para merecer aviso na tela. */
  degraded: boolean;
}

export type SosFixRejection =
  "sem_fix" | "coordenada_invalida" | "fix_antigo" | "fix_impreciso" | "fix_simulado";

export type SosFixResult =
  { ok: true; fix: SosFix } | { ok: false; reason: SosFixRejection; message: string };

const FIX_MESSAGES: Record<SosFixRejection, string> = {
  sem_fix: "Sem leitura de GPS. Vá para um lugar aberto e toque em tentar de novo.",
  coordenada_invalida:
    "O aparelho devolveu uma coordenada impossível. O SOS não será registrado com ela.",
  fix_antigo: "A última posição é antiga demais para uma emergência. Buscando uma nova leitura.",
  fix_impreciso:
    "O GPS só conseguiu uma posição aproximada demais para o resgate. Vá para um lugar aberto e tente de novo.",
  fix_simulado: "A localização veio de um app de simulação. O SOS não aceita posição falsa.",
};

/** Mesma regra do `isValidCoordinate` em coords.ts, replicada aqui para manter
 * este módulo sem imports. O teste `sos-client.test.ts` compara as duas
 * implementações a cada execução, então elas não podem divergir em silêncio. */
function hasRealCoords(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // Null Island: (0,0) é o zero devolvido por GPS quebrado, não um lugar.
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Decide se um fix pode virar um SOS. Nunca "conserta" a posição: ou o fix
 * serve como veio do aparelho, ou o acionamento é recusado com o motivo.
 */
export function validateSosFix(input: RawFix | null | undefined, now = Date.now()): SosFixResult {
  if (!input) {
    return { ok: false, reason: "sem_fix", message: FIX_MESSAGES.sem_fix };
  }

  if (input.mocked === true || input.isFromMockProvider === true) {
    return { ok: false, reason: "fix_simulado", message: FIX_MESSAGES.fix_simulado };
  }

  if (!hasRealCoords(input.lat, input.lng)) {
    return { ok: false, reason: "coordenada_invalida", message: FIX_MESSAGES.coordenada_invalida };
  }

  if (typeof input.speed === "number" && Number.isFinite(input.speed)) {
    if (Math.abs(input.speed) > SOS_IMPOSSIBLE_SPEED_MS) {
      return { ok: false, reason: "fix_simulado", message: FIX_MESSAGES.fix_simulado };
    }
  }

  const ts =
    typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
      ? input.timestamp
      : null;
  if (ts == null) {
    return { ok: false, reason: "sem_fix", message: FIX_MESSAGES.sem_fix };
  }
  // Fix no futuro = relógio do aparelho errado ou posição injetada.
  if (ts - now > 5_000) {
    return { ok: false, reason: "fix_simulado", message: FIX_MESSAGES.fix_simulado };
  }

  const ageMs = Math.max(0, now - ts);
  if (ageMs > SOS_MAX_FIX_AGE_MS) {
    return { ok: false, reason: "fix_antigo", message: FIX_MESSAGES.fix_antigo };
  }

  const accuracy =
    typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy >= 0
      ? input.accuracy
      : null;
  if (accuracy != null && accuracy > SOS_MAX_ACCURACY_M) {
    return { ok: false, reason: "fix_impreciso", message: FIX_MESSAGES.fix_impreciso };
  }

  return {
    ok: true,
    fix: {
      lat: input.lat as number,
      lng: input.lng as number,
      accuracy,
      timestamp: ts,
      ageMs,
      degraded: accuracy != null && accuracy > SOS_WARN_ACCURACY_M,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Proteção contra acionamento duplicado
 * ------------------------------------------------------------------ */

export type TriggerBlock =
  "em_andamento" | "sos_ja_ativo" | "acionado_ha_pouco" | "hold_incompleto";

export interface TriggerGuardInput {
  /** Uma chamada ainda não terminou (lock de concorrência). */
  inFlight: boolean;
  /** Já existe um SOS aberto para este usuário. */
  activeSosId: string | null;
  /** Epoch do último acionamento bem-sucedido, ou 0. */
  lastTriggerAt: number;
  /** Milissegundos de pressão contínua realmente cumpridos. */
  heldMs?: number;
  now?: number;
}

export type TriggerGuardResult =
  { allowed: true } | { allowed: false; reason: TriggerBlock; message: string };

const BLOCK_MESSAGES: Record<TriggerBlock, string> = {
  em_andamento: "O acionamento já está em curso.",
  sos_ja_ativo: "Você já tem um SOS aberto. Cancele o atual antes de abrir outro.",
  acionado_ha_pouco: "Você acionou o SOS agora há pouco. O alerta continua aberto.",
  hold_incompleto: "Segure o botão por 3 segundos para acionar.",
};

/**
 * Porteiro único do fluxo. Roda antes de qualquer efeito colateral — antes do
 * GPS, antes do banco, antes de abrir o WhatsApp.
 */
export function guardTrigger(input: TriggerGuardInput): TriggerGuardResult {
  const now = input.now ?? Date.now();
  if (input.inFlight) {
    return { allowed: false, reason: "em_andamento", message: BLOCK_MESSAGES.em_andamento };
  }
  if (input.activeSosId) {
    return { allowed: false, reason: "sos_ja_ativo", message: BLOCK_MESSAGES.sos_ja_ativo };
  }
  if (input.heldMs != null && input.heldMs < SOS_HOLD_MS) {
    return { allowed: false, reason: "hold_incompleto", message: BLOCK_MESSAGES.hold_incompleto };
  }
  if (input.lastTriggerAt > 0 && now - input.lastTriggerAt < SOS_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: "acionado_ha_pouco",
      message: BLOCK_MESSAGES.acionado_ha_pouco,
    };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ *
 * Mensagem de emergência
 * ------------------------------------------------------------------ */

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export interface SosMessageInput {
  name: string;
  fix: SosFix | null;
  when: Date;
  note?: string | null;
}

/**
 * Monta o texto que vai para o contato. Sem localização, a mensagem continua
 * saindo — só que dizendo com todas as letras que a posição não veio, em vez
 * de mandar um link para lugar nenhum.
 */
export function buildSosMessage(input: SosMessageInput): string {
  const quando = input.when.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const linhas: string[] = [
    "🚨 MOTO ANJO — SOS",
    "",
    `${input.name || "Um motociclista"} acionou um pedido de socorro.`,
    "",
  ];

  if (input.fix) {
    linhas.push("📍 Localização:", googleMapsUrl(input.fix.lat, input.fix.lng));
    if (input.fix.accuracy != null) {
      linhas.push(`(precisão de cerca de ${Math.round(input.fix.accuracy)} m)`);
    }
  } else {
    linhas.push("📍 Localização: o GPS não respondeu. Ligue para confirmar onde ele está.");
  }

  linhas.push("", "🕒 Horário:", quando);

  if (input.note && input.note.trim()) {
    linhas.push("", "📝 Observação:", input.note.trim());
  }

  linhas.push("", "Se não conseguir contato, vá até o local ou ligue 190.");
  return linhas.join("\n");
}

/* ------------------------------------------------------------------ *
 * Estados honestos
 * ------------------------------------------------------------------ */

export type SosPhase =
  | "ocioso"
  | "localizando"
  | "gps_recusado"
  | "sem_internet"
  | "registrando"
  | "aguardando_envio"
  | "sem_contatos"
  | "falha_registro"
  | "cancelando";

const PHASE_LABELS: Record<SosPhase, string> = {
  ocioso: "Pronto para acionar",
  localizando: "Buscando sua posição pelo GPS",
  gps_recusado: "Sem posição confiável do GPS",
  sem_internet: "Sem internet — alerta preparado só no aparelho",
  registrando: "Registrando o SOS no servidor",
  aguardando_envio: "SOS registrado — falta você enviar pelo WhatsApp",
  sem_contatos: "SOS registrado — nenhum contato de emergência cadastrado",
  falha_registro: "O servidor não confirmou o registro",
  cancelando: "Cancelando o alerta",
};

export function sosPhaseLabel(phase: SosPhase): string {
  return PHASE_LABELS[phase];
}

/**
 * Estados de uma notificação individual.
 *
 * `entregue_confirmado` existe apenas para o caso em que o webhook de status
 * do provedor gravou `delivered`/`read` no banco. Nenhum outro caminho chega
 * nele.
 */
export type SosDeliveryState =
  | "preparada"
  | "aberta_no_whatsapp"
  | "enviando"
  | "aceita_pelo_provedor"
  | "recusada_pelo_provedor"
  | "envio_incerto"
  | "entregue_confirmado";

const DELIVERY_LABELS: Record<SosDeliveryState, string> = {
  preparada: "Mensagem pronta — ainda não saiu",
  aberta_no_whatsapp: "WhatsApp aberto — confirme o envio por lá",
  enviando: "Enviando aviso pelo WhatsApp…",
  aceita_pelo_provedor: "WhatsApp aceitou o aviso. Aguardando confirmação.",
  recusada_pelo_provedor: "Não foi possível enviar. Use o botão Enviar.",
  envio_incerto: "Envio sem confirmação. Verifique com o contato antes de reenviar.",
  entregue_confirmado: "Entregue — confirmado pelo WhatsApp.",
};

export function sosDeliveryLabel(state: SosDeliveryState): string {
  return DELIVERY_LABELS[state];
}

/**
 * Quando o botão manual de WhatsApp deve aparecer.
 *
 * A regra existe para não pedir à pessoa que mande a mesma mensagem duas
 * vezes. Enquanto a API está com a mensagem na mão (`enviando`), ou já a
 * aceitou (`aceita_pelo_provedor`), ou o webhook confirmou a entrega
 * (`entregue_confirmado`), o caminho manual sai da tela.
 *
 * Nos outros três casos ele fica: nada saiu ainda, ou saiu pelas mãos da
 * própria pessoa e ela pode querer reenviar, ou a API recusou e o manual é a
 * única saída que resta.
 */
export function allowsManualSend(state: SosDeliveryState): boolean {
  return (
    state === "preparada" ||
    state === "aberta_no_whatsapp" ||
    state === "recusada_pelo_provedor" ||
    state === "envio_incerto"
  );
}

/**
 * Traduz a linha do banco para um estado de tela.
 *
 * `status = 'delivered'` só é gravado pelo webhook de status do provedor. É a
 * única porta de entrada para o rótulo de entrega.
 */
export function deliveryStateFromRow(
  row: { status: string | null },
  openedByUser = false,
): SosDeliveryState {
  switch (row.status) {
    case "delivered":
    case "read":
      return "entregue_confirmado";
    case "sent":
      return "aceita_pelo_provedor";
    case "sending":
      return "enviando";
    case "failed":
      return "recusada_pelo_provedor";
    case "unknown":
      return "envio_incerto";
    default:
      return openedByUser ? "aberta_no_whatsapp" : "preparada";
  }
}

/** Verdadeiro só quando um webhook confirmou. Usado nos testes e na UI. */
export function claimsDelivery(state: SosDeliveryState): boolean {
  return state === "entregue_confirmado";
}

/** Current delivery rows determine the panel title, independently of the initial send mode. */
export function sosPanelTitle(
  phase: SosPhase,
  recipients: readonly SosDeliveryState[],
  fallback = sosPhaseLabel(phase),
): string {
  if (phase !== "aguardando_envio") return fallback;
  const states = new Set(recipients);
  if (states.size === 0 || (states.size === 1 && states.has("preparada"))) return fallback;
  if (states.size > 1) return "SOS registrado — confira a situação de cada contato";
  if (states.has("enviando")) return "SOS registrado — enviando avisos pelo WhatsApp";
  if (states.has("aceita_pelo_provedor"))
    return "Aviso aceito pelo WhatsApp. Aguardando confirmação";
  if (states.has("recusada_pelo_provedor")) return "Envio não realizado. Avise pelo botão Enviar";
  if (states.has("envio_incerto"))
    return "SOS registrado — envio sem confirmação; verifique com o contato";
  if (states.has("entregue_confirmado")) return "SOS registrado — entrega confirmada aos contatos";
  return "SOS registrado — confirme o envio no WhatsApp";
}

/**
 * Único status de evento que significa "socorro em curso".
 *
 * `cancelled`, `resolved`, `expired` e `superseded` são eventos encerrados —
 * nenhum deles pode voltar à tela como alerta aberto, sob pena de a pessoa
 * achar que tem ajuda a caminho quando não tem.
 */
export function isActiveSosStatus(status: string | null | undefined): boolean {
  return status === "active";
}

/**
 * Marcador que a função `sos_open` coloca na mensagem quando o request_id
 * pertence a um evento já encerrado. O cliente reconhece por ele para
 * descartar o request_id velho e gerar um novo na próxima tentativa.
 */
export const SOS_ERRO_ENCERRADO = "SOS_ENCERRADO";

export function isEventoEncerradoError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return msg.includes(SOS_ERRO_ENCERRADO);
}

/* ------------------------------------------------------------------ *
 * Persistência local — sobreviver a F5 e troca de tela
 * ------------------------------------------------------------------ */

export interface ActiveSosSnapshot {
  sosEventId: string;
  requestId: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  triggeredAt: number;
}

type StorageLike = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

function getStorage(): StorageLike | null {
  try {
    const g = globalThis as unknown as { localStorage?: StorageLike };
    return g.localStorage ?? null;
  } catch {
    return null; // Safari em modo privado, WebView sem storage
  }
}

export function serializeActiveSos(snap: ActiveSosSnapshot): string {
  return JSON.stringify(snap);
}

/** Devolve null para lixo, para formato errado e para snapshot vencido. */
export function parseActiveSos(raw: string | null, now = Date.now()): ActiveSosSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (!isValidUuid(o.sosEventId) || !isValidUuid(o.requestId)) return null;
  if (typeof o.triggeredAt !== "number" || !Number.isFinite(o.triggeredAt)) return null;
  if (now - o.triggeredAt > SOS_LOCAL_TTL_MS) return null;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    sosEventId: o.sosEventId as string,
    requestId: o.requestId as string,
    lat: num(o.lat),
    lng: num(o.lng),
    accuracy: num(o.accuracy),
    triggeredAt: o.triggeredAt,
  };
}

export function saveActiveSos(snap: ActiveSosSnapshot): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(SOS_STORAGE_KEY, serializeActiveSos(snap));
  } catch {
    /* cota cheia — o banco continua sendo a fonte da verdade */
  }
}

export function loadActiveSos(now = Date.now()): ActiveSosSnapshot | null {
  const s = getStorage();
  if (!s) return null;
  try {
    return parseActiveSos(s.getItem(SOS_STORAGE_KEY), now);
  } catch {
    return null;
  }
}

export function clearActiveSos(): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(SOS_STORAGE_KEY);
  } catch {
    /* nada a fazer */
  }
}

/* ------------------------------------------------------------------ *
 * WhatsApp manual
 * ------------------------------------------------------------------ */

/** Normaliza para E.164 sem "+", assumindo Brasil quando vier só DDD+número. */
export function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function waLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
