import { randomUUID } from "node:crypto";
import { sosDatabase } from "./sos-database.server";
import { isWhatsAppConfigured, sendSosTemplate } from "./sos.server";

export async function dispatchDueSosNotifications(
  options: { sosEventId?: string; onlyFailed?: boolean } = {},
  db = sosDatabase,
  send = sendSosTemplate,
) {
  const result = { claimed: 0, accepted: 0, failed: 0, unknown: 0, skipped: 0, disabled: false };
  // This check precedes claims: dry/unconfigured deployments never drain the queue.
  if (!isWhatsAppConfigured()) return { ...result, disabled: true };
  const claimToken = randomUUID();
  const { data, error } = await db.rpc("claim_due_sos_notifications", {
    _claim_token: claimToken,
    _sos_event_id: options.sosEventId,
    _only_failed: options.onlyFailed ?? false,
    _max: 10,
  });
  if (error) throw new Error("Não foi possível reservar os envios.");
  const rows = data ?? [];
  result.claimed = rows.length;
  const settlements = await Promise.allSettled(
    rows.map(async (row) => {
      // Cancellation is checked again just before external work, not just during claim.
      const { data: event, error: eventError } = await db
        .from("sos_events")
        .select("status")
        .eq("id", row.sos_event_id)
        .maybeSingle();
      if (eventError) throw new Error("Não foi possível confirmar o estado do SOS.");
      const response =
        event?.status === "active"
          ? await send(row.recipient_phone, {
              name: row.rider_name,
              phone: row.rider_phone,
              lat: row.latitude,
              lng: row.longitude,
              when: new Date(row.triggered_at),
            })
          : {
              ok: false as const,
              error: "SOS encerrado antes do envio.",
              uncertain: false,
              retryable: false,
            };
      if (event?.status !== "active") result.skipped++;
      const outcome = response.ok ? "sent" : response.uncertain ? "unknown" : "failed";
      const { data: settled, error: settleError } = await db.rpc("settle_sos_dispatch", {
        _id: row.id,
        _claim_token: claimToken,
        _outcome: outcome,
        _provider_message_id: response.ok ? response.providerMessageId : undefined,
        _error: response.ok ? undefined : response.error,
        _retryable: !response.ok && response.retryable === true,
      });
      // False is a lost lease, not success. Never return an accepted count without durable settlement.
      if (settleError || !settled)
        throw new Error("Resultado de envio não persistido; aguarde reconciliação.");
      if (outcome === "sent") result.accepted++;
      else if (outcome === "unknown") result.unknown++;
      else result.failed++;
    }),
  );
  if (settlements.some((item) => item.status === "rejected")) {
    // Repeated scheduler calls are safe: abandoned leases become unknown, never blind retries.
    throw new Error("Uma ou mais notificações aguardam reconciliação do resultado.");
  }
  return result;
}
