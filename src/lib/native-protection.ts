import { isNativeApp } from "./native";
import { supabase } from "@/integrations/supabase/client";
import {
  createNativeProtectionSession,
  revokeNativeProtectionSession,
  cancelNativeProtectionRequest,
} from "./native-protection.functions";

export interface NativeProtectionState {
  supported: boolean;
  configured: boolean;
  armed: boolean;
  sensoresDisponiveis?: boolean;
  userId?: string;
  tripStartedAt?: number;
  sessionId?: string;
  expiresAt?: string;
  phase:
    | "normal"
    | "anomaly"
    | "candidate"
    | "countdown"
    | "cancelled"
    | "registering"
    | "registered"
    | "failed";
  countdownEndsAt?: number;
  requestId?: string;
  sosEventId?: string;
  error?: string;
  diagnostic?: boolean;
  needsReconfiguration?: boolean;
}
export const NO_NATIVE_PROTECTION: NativeProtectionState = {
  supported: false,
  configured: false,
  armed: false,
  phase: "normal",
};
interface NativeProtectionPlugin {
  estadoProtecaoNativa(): Promise<NativeProtectionState>;
  configurarProtecaoNativa(options: {
    token: string;
    endpoint: string;
    expiresAt: string;
    sessionId: string;
    userId: string;
    tripStartedAt: number;
    enabled: boolean;
  }): Promise<NativeProtectionState>;
  limparProtecaoNativa(options?: {
    preservePending?: boolean;
    expectedSessionId?: string;
    expectedRequestId?: string;
  }): Promise<NativeProtectionState>;
  cancelarAlertaNativo(): Promise<NativeProtectionState>;
  solicitarSosNativo(): Promise<NativeProtectionState>;
  atualizarProtecaoNativa(options: {
    sosEventId: string | null;
    closedEventId?: string;
  }): Promise<NativeProtectionState>;
  iniciarDiagnosticoProtecaoNativa(): Promise<NativeProtectionState>;
}
function nativePlugin(): NativeProtectionPlugin | null {
  if (!isNativeApp()) return null;
  return (
    (window as unknown as { Capacitor?: { Plugins?: { ViagemSegura?: NativeProtectionPlugin } } })
      .Capacitor?.Plugins?.ViagemSegura ?? null
  );
}
function missingMethod(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "UNIMPLEMENTED"
  );
}
async function bounded<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tempo de resposta esgotado.")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function revokeLater(sessionId: string): Promise<void> {
  return bounded(revokeNativeProtectionSession({ data: { sessionId } }), 3000)
    .then(() => undefined)
    .catch(() => undefined);
}
export async function readNativeProtection(): Promise<NativeProtectionState> {
  const plugin = nativePlugin();
  if (!plugin || typeof plugin.estadoProtecaoNativa !== "function") return NO_NATIVE_PROTECTION;
  try {
    const state = await bounded(plugin.estadoProtecaoNativa(), 2000);
    if (state.sessionId) activeSessionId = state.sessionId;
    return state;
  } catch (error) {
    if (missingMethod(error)) return NO_NATIVE_PROTECTION;
    throw error;
  }
}

let generation = 0;
let activeSessionId: string | undefined;
let operations: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation);
  operations = next.catch(() => undefined);
  return next;
}
function deviceSessionId(): string {
  const key = "moto-anjo:native-device-session";
  const saved = localStorage.getItem(key);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

/** Configuration is serialized; stop invalidates it immediately, even while offline. */
export function configureNativeProtection(
  userId: string,
  tripStartedAt: number,
): Promise<NativeProtectionState> {
  const operation = ++generation;
  return serialized(async () => {
    const plugin = nativePlugin();
    const current = await readNativeProtection();
    if (!plugin || !current.supported || operation !== generation) return current;
    if (
      current.configured &&
      !current.needsReconfiguration &&
      current.userId === userId &&
      current.tripStartedAt === tripStartedAt &&
      Date.parse(current.expiresAt ?? "") > Date.now()
    )
      return current;
    const pending = createNativeProtectionSession({
      data: { deviceSessionId: deviceSessionId(), tripStartedAt },
    });
    void pending
      .then((issued) => {
        if (operation !== generation) void revokeLater(issued.sessionId);
      })
      .catch(() => undefined);
    let issued;
    try {
      issued = await bounded(pending);
    } catch (error) {
      if (operation === generation) generation += 1;
      throw error;
    }
    if (operation !== generation) {
      void revokeLater(issued.sessionId);
      return NO_NATIVE_PROTECTION;
    }
    try {
      const configured = await plugin.configurarProtecaoNativa({
        ...issued,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        userId,
        tripStartedAt,
        enabled: true,
        endpoint: `${window.location.origin}/api/native/sos`,
      });
      if (operation !== generation) {
        await plugin.limparProtecaoNativa({ preservePending: true });
        void revokeLater(issued.sessionId);
        return NO_NATIVE_PROTECTION;
      }
      activeSessionId = issued.sessionId;
      return configured;
    } catch (error) {
      void revokeLater(issued.sessionId);
      throw error;
    }
  });
}
export async function stopNativeProtection(options?: { preservePending?: boolean }): Promise<void> {
  generation += 1;
  const plugin = nativePlugin();
  if (!plugin || typeof plugin.limparProtecaoNativa !== "function") return;
  const snapshot = readNativeProtection().catch(() => null);
  // Clear the device first, even if the network cannot revoke the capability.
  try {
    await bounded(plugin.limparProtecaoNativa(options), 2000);
  } catch (error) {
    if (missingMethod(error)) return;
    throw error;
  }
  const current = await snapshot;
  const sessionId = current?.sessionId ?? activeSessionId;
  activeSessionId = undefined;
  if (sessionId) await revokeLater(sessionId);
}
export async function requestNativeSos(): Promise<NativeProtectionState> {
  const plugin = nativePlugin();
  if (!plugin) throw new Error("SOS nativo indisponível.");
  return plugin.solicitarSosNativo();
}
export async function cancelNativeAlert(): Promise<NativeProtectionState> {
  const plugin = nativePlugin();
  if (!plugin) return NO_NATIVE_PROTECTION;
  try {
    return await plugin.cancelarAlertaNativo();
  } catch (error) {
    const state = await readNativeProtection();
    if (!state.requestId || !state.sessionId || state.diagnostic) throw error;
    // User pressed cancel. Revoke under the server's session lock before
    // confirming closure, including a response lost after registration.
    await bounded(
      cancelNativeProtectionRequest({
        data: { sessionId: state.sessionId, requestId: state.requestId },
      }),
    );
    return plugin.limparProtecaoNativa({
      expectedSessionId: state.sessionId,
      expectedRequestId: state.requestId,
    });
  }
}
export async function reflectActiveSos(sosEventId: string | null): Promise<void> {
  const plugin = nativePlugin();
  if (plugin) await plugin.atualizarProtecaoNativa({ sosEventId });
}
/** Only a successful owner-scoped read of a terminal event can clear a native latch. */
export async function reconcileNativeSos(eventId: string): Promise<boolean> {
  const plugin = nativePlugin();
  if (!plugin) return false;
  const { data, error } = await bounded(
    Promise.resolve(
      supabase.from("sos_events").select("id,status").eq("id", eventId).maybeSingle(),
    ),
  );
  if (error || !data || (data.status !== "cancelled" && data.status !== "resolved")) return false;
  await plugin.atualizarProtecaoNativa({ sosEventId: null, closedEventId: data.id });
  return true;
}
export async function startNativeProtectionDiagnostic(): Promise<void> {
  const plugin = nativePlugin();
  if (!plugin) throw new Error("Diagnóstico nativo indisponível.");
  await plugin.iniciarDiagnosticoProtecaoNativa();
}
