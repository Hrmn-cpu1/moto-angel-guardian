import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidCoordinate } from "./coords";
import { SOS_MAX_ACCURACY_M, SOS_MAX_FIX_AGE_MS } from "./sos-client";
import { isWhatsAppConfigured } from "./sos.server";

type NativeDatabase = Database & {
  public: {
    Functions: {
      native_protection_create: {
        Args: {
          _user_id: string;
          _device_id: string;
          _trip_started_at: string;
          _token_hash: string;
        };
        Returns: { session_id: string; expires_at: string }[];
      };
      native_protection_revoke: {
        Args: { _user_id: string; _session_id: string };
        Returns: boolean;
      };
      native_protection_cancel_pending: {
        Args: { _user_id: string; _session_id: string; _request_id: string };
        Returns: { cancelled: boolean; sos_event_id: string | null; status: string }[];
      };
      native_protection_sos_open: {
        Args: {
          _token_hash: string;
          _request_id: string;
          _lat: number;
          _lng: number;
          _accuracy_m: number;
          _fix_age_ms: number;
          _source: string;
        };
        Returns: Database["public"]["Functions"]["sos_open"]["Returns"];
      };
    };
  };
};
const nativeDatabase = supabaseAdmin as unknown as SupabaseClient<NativeDatabase>;
export const hashProtectionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createProtectionSession(
  userId: string,
  input: { deviceSessionId: string; tripStartedAt: number },
  db = nativeDatabase,
) {
  const age = Date.now() - input.tripStartedAt;
  if (!Number.isSafeInteger(input.tripStartedAt) || age < -60_000 || age >= 12 * 60 * 60_000) {
    throw new Error("A viagem precisa ter começado nas últimas 12 horas.");
  }
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await db.rpc("native_protection_create", {
    _user_id: userId,
    _device_id: input.deviceSessionId,
    _trip_started_at: new Date(input.tripStartedAt).toISOString(),
    _token_hash: hashProtectionToken(token),
  });
  const session = data?.[0];
  if (error || !session) throw new Error("Não foi possível ativar a proteção nativa.");
  return { sessionId: session.session_id, token, expiresAt: session.expires_at };
}

export async function revokeProtectionSession(
  userId: string,
  sessionId: string,
  db = nativeDatabase,
) {
  const { error } = await db.rpc("native_protection_revoke", {
    _user_id: userId,
    _session_id: sessionId,
  });
  if (error) throw new Error("Não foi possível confirmar o encerramento da proteção nativa.");
  return { revoked: true };
}

/** Revoke and reconcile atomically: only then can Android discard an uncertain request. */
export async function cancelProtectionRequest(
  userId: string,
  input: { sessionId: string; requestId: string },
  db = nativeDatabase,
) {
  const { data, error } = await db.rpc("native_protection_cancel_pending", {
    _user_id: userId,
    _session_id: input.sessionId,
    _request_id: input.requestId,
  });
  const row = data?.[0];
  if (error || !row?.cancelled || !["cancelled", "resolved", "absent"].includes(row.status)) {
    throw new Error(
      "O servidor não confirmou o cancelamento. Preserve o pedido e confira o SOS ativo no aplicativo.",
    );
  }
  return {
    cancelled: true as const,
    sosEventId: row.sos_event_id,
    status: row.status as "cancelled" | "resolved" | "absent",
  };
}

const NativeSosInput = z
  .object({
    requestId: z.string().uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(SOS_MAX_ACCURACY_M),
    fixAgeMs: z.number().int().min(0).max(SOS_MAX_FIX_AGE_MS),
    source: z.enum(["manual", "crash"]),
  })
  .strict()
  .refine(({ lat, lng }) => isValidCoordinate(lat, lng));

async function readLimitedBody(request: Request): Promise<string> {
  const limit = 4096;
  if (Number(request.headers.get("content-length")) > limit) throw new Error("body limit");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("body limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Limited bearer only opens SOS; it cannot access contacts, profile or an Auth session. */
export async function handleNativeSos(request: Request, db = nativeDatabase) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (new URL(request.url).protocol !== "https:") return json({ error: "https_required" }, 400);
  const authorization = request.headers.get("authorization");
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "")?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  let input: z.infer<typeof NativeSosInput>;
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "invalid_request" }, 400);
    }
    input = NativeSosInput.parse(JSON.parse(await readLimitedBody(request)));
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  try {
    const { data, error } = await db.rpc("native_protection_sos_open", {
      _token_hash: hashProtectionToken(token),
      _request_id: input.requestId,
      _lat: input.lat,
      _lng: input.lng,
      _accuracy_m: input.accuracy,
      _fix_age_ms: input.fixAgeMs,
      _source: input.source,
    });
    if (error?.code === "42501") return json({ error: "unauthorized" }, 401);
    if (error?.code === "22023") return json({ error: "invalid_request" }, 400);
    const row = data?.[0];
    if (error || !row) return json({ error: "unavailable" }, 503);
    const autoDispatch = isWhatsAppConfigured();
    // Registration is already durable. The scheduled consumer owns delivery;
    // provider latency must not consume the Android registration timeout.
    return json({
      sosEventId: row.sos_event_id,
      requestId: row.request_id,
      status: row.status,
      reused: row.reused,
      triggeredAt: row.triggered_at,
      queued: row.queued,
      autoDispatch,
    });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
