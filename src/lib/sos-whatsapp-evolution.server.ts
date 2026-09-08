import {
  buildSosMessage,
  isWhatsAppConfigured,
  normalizeE164,
  type SendResult,
  type SosTemplateData,
} from "./sos.server.ts";
import {
  eventAllowedForAutoDelivery,
  evolutionConfiguration,
  whatsappProvider,
} from "./sos-whatsapp-config.server.ts";

/** Evolution 2.x sendText: response key.id confirms acceptance, never delivery. */
export async function sendSosEvolution(
  recipientPhone: string,
  data: SosTemplateData,
  fetcher: typeof fetch = fetch,
  confirmMaySend?: () => Promise<boolean>,
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
  const config = evolutionConfiguration();
  if (whatsappProvider() !== "evolution" || !isWhatsAppConfigured() || !config)
    return fail("Envio Evolution desativado ou configuração incompleta.");
  if (!eventAllowedForAutoDelivery(data.when))
    return fail("SOS anterior à ativação automática. Confira o contato manual.");
  const number = normalizeE164(recipientPhone);
  if (!/^[1-9]\d{9,14}$/.test(number)) return fail("Telefone de destino inválido.");
  const headers = { apikey: config.apiKey, "Content-Type": "application/json" };
  // A disconnected instance must not be mistaken for an accepted request.
  // This read-only preflight can safely retry; it has no external send side effect.
  try {
    const connection = await fetcher(
      `${config.baseUrl}/instance/connectionState/${encodeURIComponent(config.instance)}`,
      {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!connection.ok)
      return fail(
        connection.status === 401 || connection.status === 403
          ? "Evolution recusou a autenticação. Confira a configuração do servidor."
          : connection.status === 404
            ? "Instância Evolution não encontrada."
            : `Não foi possível consultar a conexão Evolution (HTTP ${connection.status}).`,
        connection.status,
        false,
        connection.status === 429 || connection.status >= 500,
      );
    const state = (await connection.json()) as {
      instance?: { instanceName?: unknown; state?: unknown };
    };
    if (state.instance?.instanceName !== config.instance || state.instance?.state !== "open")
      return fail(
        "Instância Evolution desconectada. Reconecte o WhatsApp e tente novamente.",
        connection.status,
        false,
        true,
      );
  } catch {
    return fail(
      "Não foi possível consultar a conexão Evolution. Nenhuma mensagem foi solicitada.",
      0,
      false,
      true,
    );
  }
  // The connection preflight may take seconds. Recheck cancellation and the
  // worker's reservation after it, immediately before the external side effect.
  if (confirmMaySend) {
    try {
      if (!(await confirmMaySend()))
        return fail(
          "SOS encerrado ou reserva de envio indisponível. Nenhuma mensagem foi solicitada.",
        );
    } catch {
      return fail(
        "Não foi possível confirmar o SOS e a reserva. Nenhuma mensagem foi solicitada.",
        0,
        false,
        true,
      );
    }
  }
  try {
    const response = await fetcher(
      `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ number, text: buildSosMessage(data), linkPreview: false }),
      },
    );
    if (!response.ok)
      return fail(
        response.status === 401 || response.status === 403
          ? "Evolution recusou a autenticação do envio. Confira a configuração do servidor."
          : `Evolution recusou ou não confirmou o envio (HTTP ${response.status}).`,
        response.status,
        response.status >= 500 || response.status === 408,
        response.status === 429,
      );
    const body = (await response.json()) as { key?: { id?: unknown }; status?: unknown };
    const id = body.key?.id;
    if (typeof id !== "string" || !id.trim() || id.length > 300 || body.status === "ERROR")
      return fail("Evolution não confirmou o identificador do envio.", response.status, true);
    return {
      ok: true,
      providerMessageId: `evolution:${config.instance}:${id}`,
      httpStatus: response.status,
      latencyMs: Date.now() - started,
    };
  } catch {
    return fail("Não foi possível confirmar o resultado do envio Evolution.", 0, true);
  }
}
