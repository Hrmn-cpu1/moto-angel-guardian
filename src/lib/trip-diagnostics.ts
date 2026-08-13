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

export function setTripDiagnosticState(next: Partial<TripDiagnosticState>): void {
  state = { ...state, ...next };
}

export function getTripDiagnosticState(): TripDiagnosticState {
  return { ...state };
}

function errorDetails(error: unknown): Pick<TripDiagnosticEntry, "name" | "message" | "stack"> {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  if (error instanceof Response) {
    return { name: "Response", message: `HTTP ${error.status}` };
  }
  return { name: "UnknownError", message: String(error).slice(0, 300) };
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
  return entry;
}