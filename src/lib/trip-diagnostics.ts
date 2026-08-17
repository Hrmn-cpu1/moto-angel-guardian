export const TRIP_CRASH_CODE = "MA-TRIP-001";

/**
 * Trilha de eventos do caminho crítico da Viagem Segura.
 *
 * O crash "This page didn't load" continua NOT PROVEN: a exception que
 * realmente derruba a WebView não foi capturada em aparelho físico. Em vez de
 * adivinhar, gravamos os marcos do fluxo e mandamos essa trilha JUNTO com o
 * primeiro erro que aparecer — quem lê o diagnóstico vê onde o fluxo parou.
 *
 * A trilha é local (memória) e só viaja anexada a um erro. Não é telemetria
 * paralela: usa `reportTripDiagnostic`, que já existe.
 */
export const EVENTOS_MA_TRIP = [
  "home.ready",
  "destination.selected",
  "trip.prepare",
  "trip.start.request",
  "trip.native.start.begin",
  "trip.native.start.success",
  "trip.native.start.fail",
  "trip.native.status.active",
  "trip.native.status.failed",
  "gps.web.watch.start",
  "gps.web.watch.stop",
  "gps.native.position",
  "trip.state.active",
  "map.init.begin",
  "map.ready",
  "map.error",
  "directions.begin",
  "directions.success",
  "directions.fail",
  "pois.request.begin",
  "pois.request.end",
  "pois.request.fail",
  "error.boundary",
  "trip.stop",
] as const;

export type EventoMaTrip = (typeof EVENTOS_MA_TRIP)[number];

export interface RegistroDeEvento {
  evento: EventoMaTrip;
  /** Só contexto técnico: etapa, código de erro, origem, duração. */
  detalhe?: string;
  duracaoMs?: number;
  t: number;
}

const MAX_EVENTOS = 24;
let trilha: RegistroDeEvento[] = [];

/** Campos livres jamais entram inteiros: recorte curto e sem URL/coordenada. */
function detalheSeguro(valor: unknown): string | undefined {
  if (valor == null) return undefined;
  const texto = typeof valor === "string" ? valor : String(valor);
  return sanitize(texto).slice(0, 80);
}

export function registrarEventoDeViagem(
  evento: EventoMaTrip,
  extra?: { detalhe?: unknown; duracaoMs?: number },
): RegistroDeEvento {
  const registro: RegistroDeEvento = {
    evento,
    t: Date.now(),
    ...(detalheSeguro(extra?.detalhe) ? { detalhe: detalheSeguro(extra?.detalhe) } : {}),
    ...(typeof extra?.duracaoMs === "number" ? { duracaoMs: Math.round(extra.duracaoMs) } : {}),
  };
  trilha = [...trilha, registro].slice(-MAX_EVENTOS);
  return registro;
}

export function trilhaDeEventos(): RegistroDeEvento[] {
  return [...trilha];
}

export function limparTrilhaDeEventos(): void {
  trilha = [];
}

type TripDiagnosticState = {
  action: string;
  tripActive: boolean;
  destinationExists: boolean;
};

export type TripDiagnosticEntry = TripDiagnosticState & {
  code: string;
  source: string;
  name: string;
  message: string;
  stack?: string;
  pathname: string;
  timestamp: string;
  /** Últimos marcos do fluxo antes do erro, em texto compacto. */
  trail?: string;
};

const STORAGE_KEY = "moto-anjo:trip-diagnostics";
const MAX_ENTRIES = 12;
let state: TripDiagnosticState = {
  action: "idle",
  tripActive: false,
  destinationExists: false,
};
let consoleDiagnosticsInstalled = false;

export function setTripDiagnosticState(next: Partial<TripDiagnosticState>): void {
  state = { ...state, ...next };
}

export function getTripDiagnosticState(): TripDiagnosticState {
  return { ...state };
}

function sanitize(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[-+]?\d{1,3}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,}/g, "[coordinates]")
    .slice(0, 2500);
}

function errorDetails(error: unknown): Pick<TripDiagnosticEntry, "name" | "message" | "stack"> {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: sanitize(error.message || "Unknown error").slice(0, 500),
      stack: error.stack ? sanitize(error.stack.split("\n").slice(0, 8).join("\n")) : undefined,
    };
  }
  if (error instanceof Response) {
    return { name: "Response", message: `HTTP ${error.status}` };
  }
  return { name: "UnknownError", message: sanitize(String(error)).slice(0, 300) };
}

export function createTripDiagnosticEntry(source: string, error: unknown): TripDiagnosticEntry {
  const trilhaTexto = trilha
    .map((r) => `${r.evento}${r.detalhe ? `:${r.detalhe}` : ""}`)
    .join(" > ")
    .slice(0, 900);
  return {
    code: TRIP_CRASH_CODE,
    source,
    ...errorDetails(error),
    ...state,
    pathname: typeof window === "undefined" ? "ssr" : window.location.pathname,
    timestamp: new Date().toISOString(),
    ...(trilhaTexto ? { trail: trilhaTexto } : {}),
  };
}

export function recordTripDiagnostic(source: string, error: unknown): TripDiagnosticEntry {
  const entry = createTripDiagnosticEntry(source, error);
  if (typeof window !== "undefined") {
    try {
      const previous = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
      const entries = Array.isArray(previous) ? previous.slice(-(MAX_ENTRIES - 1)) : [];
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, entry]));
    } catch {
      // Diagnostics must never become a second failure source.
    }
  }
  if (typeof window !== "undefined") {
    void import("./trip-diagnostics.functions")
      .then(({ reportTripDiagnostic }) => reportTripDiagnostic({ data: entry }))
      .catch(() => undefined);
  }
  return entry;
}

export function installTripConsoleDiagnostics(): () => void {
  if (typeof window === "undefined" || consoleDiagnosticsInstalled) return () => {};
  consoleDiagnosticsInstalled = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const error = args.find((arg) => arg instanceof Error || arg instanceof Response);
    if (error) recordTripDiagnostic("console.error", error);
  };
  return () => {
    console.error = original;
    consoleDiagnosticsInstalled = false;
  };
}