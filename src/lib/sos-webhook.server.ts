import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sosDatabase } from "./sos-database.server";

export function secretEquals(value: string | null, expected: string | undefined): boolean {
  if (!expected || !value) return false;
  const actual = Buffer.from(value);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function verifyMetaSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return secretEquals(
    signature,
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  );
}

const Status = z.object({
  id: z.string().min(1).max(512),
  status: z.enum(["sent", "failed", "delivered", "read"]),
  timestamp: z
    .string()
    .regex(/^\d{1,11}$/)
    .transform((value) => Number(value) * 1000)
    .refine((value) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())),
});
const Payload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z
                .object({
                  metadata: z.object({ phone_number_id: z.string() }).optional(),
                  statuses: z.array(Status).max(100).optional(),
                })
                .passthrough(),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});

export async function handleWhatsAppWebhook(request: Request, db = sosDatabase): Promise<Response> {
  const env = process.env;
  if (request.method === "GET") {
    const url = new URL(request.url);
    const challenge = url.searchParams.get("hub.challenge");
    if (
      url.searchParams.get("hub.mode") !== "subscribe" ||
      !challenge ||
      challenge.length > 512 ||
      !secretEquals(url.searchParams.get("hub.verify_token"), env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    ) {
      return new Response("forbidden", { status: 403 });
    }
    return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!env.WHATSAPP_APP_SECRET || !env.WHATSAPP_PHONE_NUMBER_ID)
    return new Response("unavailable", { status: 503 });
  // Meta posts small status batches. Bound both declared and actual bytes.
  if (Number(request.headers.get("content-length")) > 256_000)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 256_000) return new Response(null, { status: 413 });
  if (
    !verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)
  ) {
    return new Response("invalid signature", { status: 401 });
  }
  let parsed: z.infer<typeof Payload>;
  try {
    parsed = Payload.parse(JSON.parse(raw));
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  for (const entry of parsed.entry)
    for (const change of entry.changes) {
      if (change.field !== "messages" || !change.value.statuses?.length) continue;
      if (change.value.metadata?.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID)
        return new Response("wrong account", { status: 403 });
      for (const status of change.value.statuses) {
        const { data, error } = await db.rpc("receive_sos_delivery", {
          _provider_message_id: status.id,
          _status: status.status,
          _occurred_at: new Date(status.timestamp).toISOString(),
        });
        if (error || !data) return new Response("receipt not persisted", { status: 503 });
      }
    }
  return new Response(null, { status: 204 });
}
