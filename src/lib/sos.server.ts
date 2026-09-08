import {
  deliveryNotBefore,
  evolutionConfiguration,
  whatsappProvider,
} from "./sos-whatsapp-config.server.ts";

// Server-only helpers for SOS/WhatsApp dispatch.
// This file is filename-blocked from client bundles by the "*.server.ts" pattern.

/** Configuration is not connection or delivery proof; the worker checks its provider. */
export function isWhatsAppConfigured(): boolean {
  if (process.env.SOS_DELIVERY_ENABLED !== "true") return false;
  if (process.env.SOS_DELIVERY_NOT_BEFORE && deliveryNotBefore() === null) return false;
  if (whatsappProvider() === "evolution") {
    return evolutionConfiguration() !== null && deliveryNotBefore() !== null;
  }
  if (whatsappProvider() !== "meta") return false;
  return Boolean(
    process.env.SOS_DELIVERY_ENABLED === "true" &&
    process.env.WHATSAPP_ACCESS_TOKEN &&
    /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") &&
    /^[a-z0-9_]+$/.test(process.env.WHATSAPP_SOS_TEMPLATE_NAME ?? "") &&
    /^[a-z]{2}(?:_[A-Z]{2})?$/.test(process.env.WHATSAPP_SOS_TEMPLATE_LANGUAGE ?? "") &&
    /^v\d+\.0$/.test(process.env.WHATSAPP_GRAPH_VERSION ?? ""),
  );
}

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
  | { ok: true; providerMessageId: string; httpStatus: number; latencyMs: number }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      latencyMs: number;
      uncertain?: boolean;
      retryable?: boolean;
    };

export interface SosTemplateData {
  name: string;
  phone: string;
  lat: number;
  lng: number;
  when: Date;
}

/** Positional body parameters must match the approved template, in this order. */
export function sosTemplateParameters(data: SosTemplateData): string[] {
  return [
    data.name,
    `https://maps.google.com/?q=${data.lat},${data.lng}`,
    data.when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    data.phone || "não informado",
  ];
}

/** No free-form fallback: emergencies usually begin outside a service window. */
export async function sendSosTemplate(
  recipientPhone: string,
  data: SosTemplateData,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  const started = Date.now();
  const fail = (
    error: string,
    httpStatus = 0,
    uncertain = false,
    retryable = false,
  ): SendResult => ({
    ok: false,
    error,
    httpStatus,
    latencyMs: Date.now() - started,
    uncertain,
    retryable,
  });
  if (whatsappProvider() !== "meta" || !isWhatsAppConfigured())
    return fail("Envio automático desativado ou template não configurado.");
  const to = normalizeE164(recipientPhone);
  if (!/^[1-9]\d{9,14}$/.test(to)) return fail("Telefone de destino inválido.");
  try {
    const res = await fetcher(
      `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(12_000),
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: process.env.WHATSAPP_SOS_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_SOS_TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: sosTemplateParameters(data).map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      },
    );
    if (!res.ok) {
      // Only an explicit rate rejection is retried. 5xx can hide an accepted send.
      return fail(
        `WhatsApp HTTP ${res.status}.`,
        res.status,
        res.status >= 500,
        res.status === 429,
      );
    }
    const parsed: unknown = await res.json();
    const id = (parsed as { messages?: Array<{ id?: unknown }> })?.messages?.[0]?.id;
    if (typeof id !== "string" || !id)
      return fail("Provedor não confirmou o identificador do envio.", res.status, true);
    return {
      ok: true,
      providerMessageId: id,
      httpStatus: res.status,
      latencyMs: Date.now() - started,
    };
  } catch {
    return fail("Não foi possível confirmar o resultado do envio.", 0, true);
  }
}
