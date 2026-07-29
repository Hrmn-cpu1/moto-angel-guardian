// Server-only helpers for SOS/WhatsApp dispatch.
// This file is filename-blocked from client bundles by the "*.server.ts" pattern.

const META_GRAPH_URL = "https://graph.facebook.com/v20.0";

export function normalizeE164(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildSosMessage(params: {
  name: string;
  phone: string;
  lat: number;
  lng: number;
  when: Date;
}): string {
  const dt = params.when.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const mapUrl = `https://maps.google.com/?q=${params.lat},${params.lng}`;
  return [
    "🚨 MOTO ANJO",
    "",
    `${params.name} acionou um SOS.`,
    "",
    "📍 Localização:",
    mapUrl,
    "",
    "🕒 Horário:",
    dt,
    "",
    "☎ Telefone:",
    params.phone || "não informado",
    "",
    "Caso não consiga contato, dirija-se imediatamente ao local.",
  ].join("\n");
}

export type SendResult =
  | { ok: true; providerMessageId: string | null; httpStatus: number; latencyMs: number }
  | { ok: false; error: string; httpStatus: number; latencyMs: number };

export async function sendWhatsAppText(
  recipientPhone: string,
  body: string,
): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const started = Date.now();
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: "WhatsApp credentials not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
      httpStatus: 0,
      latencyMs: 0,
    };
  }
  const to = normalizeE164(recipientPhone);
  if (!to) {
    return { ok: false, error: "Invalid recipient phone.", httpStatus: 0, latencyMs: 0 };
  }
  try {
    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body },
      }),
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      console.error(
        `[whatsapp] send failed to=${to} status=${res.status} latency=${latencyMs}ms body=${text}`,
      );
      return { ok: false, error: `HTTP ${res.status}: ${text}`, httpStatus: res.status, latencyMs };
    }
    let providerMessageId: string | null = null;
    try {
      const parsed = JSON.parse(text) as { messages?: Array<{ id?: string }> };
      providerMessageId = parsed.messages?.[0]?.id ?? null;
    } catch {
      // ignore parse error, still success
    }
    console.log(
      `[whatsapp] sent to=${to} id=${providerMessageId ?? "?"} status=${res.status} latency=${latencyMs}ms`,
    );
    return { ok: true, providerMessageId, httpStatus: res.status, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[whatsapp] network error to=${to} latency=${latencyMs}ms err=${msg}`);
    return { ok: false, error: `Network error: ${msg}`, httpStatus: 0, latencyMs };
  }
}