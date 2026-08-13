import { recordTripDiagnostic } from "./trip-diagnostics";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
  mechanism: LovableErrorOptions["mechanism"] = "react_error_boundary",
) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: mechanism,
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism,
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  window.__lovableReportRuntimeError?.({
    message,
    stack: error instanceof Error ? error.stack : undefined,
    filename: window.location.pathname,
  });
}

let globalReportingInstalled = false;

/** Captura falhas assíncronas que não chegam a um error boundary do React. */
export function installGlobalErrorReporting(): () => void {
  if (typeof window === "undefined" || globalReportingInstalled) return () => {};
  globalReportingInstalled = true;

  const onError = (event: ErrorEvent) => {
    const diagnostic = recordTripDiagnostic(
      "window.onerror",
      event.error ?? new Error(event.message),
    );
    reportLovableError(
      event.error ?? new Error(event.message),
      { boundary: "window.onerror", tripDiagnostic: diagnostic },
      "onerror",
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    const diagnostic = recordTripDiagnostic("window.unhandledrejection", error);
    reportLovableError(
      error,
      { boundary: "window.unhandledrejection", tripDiagnostic: diagnostic },
      "unhandledrejection",
    );
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    globalReportingInstalled = false;
  };
}
