export const TRIP_CRASH_CODE = "MA-TRIP-001";

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
  return {
    code: TRIP_CRASH_CODE,
    source,
    ...errorDetails(error),
    ...state,
    pathname: typeof window === "undefined" ? "ssr" : window.location.pathname,
    timestamp: new Date().toISOString(),
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