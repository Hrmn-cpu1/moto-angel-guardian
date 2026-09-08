import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCoordinate } from "@/lib/coords";
import { SOS_MAX_ACCURACY_M, SOS_MAX_FIX_AGE_MS } from "@/lib/sos-client";

/**
 * Entrada do acionamento.
 *
 * As mesmas regras que o cliente aplica em `validateSosFix` são reaplicadas
 * aqui. O cliente pode ser adulterado; o servidor não confia nele.
 */
const TriggerInput = z
  .object({
    requestId: z.string().uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(SOS_MAX_ACCURACY_M).nullable().optional(),
    fixAgeMs: z.number().int().min(0).max(SOS_MAX_FIX_AGE_MS).nullable().optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .refine((v) => isValidCoordinate(v.lat, v.lng), {
    message: "Coordenada inválida para um acionamento de emergência.",
  });

const DispatchInput = z.object({
  sosEventId: z.string().uuid(),
  onlyFailed: z.boolean().optional().default(false),
});

export interface TriggerSosResult {
  sosEventId: string;
  requestId: string;
  /**
   * Ciclo de vida do evento devolvido pelo banco. Só 'active' significa
   * socorro em curso — o hook confere isto antes de salvar qualquer snapshot.
   */
  status: string;
  /** true quando o pedido já existia: retry, duplo toque ou SOS ainda aberto. */
  reused: boolean;
  triggeredAt: string;
  queued: number;
  profile: { name: string; phone: string };
  /** Só é true quando o servidor realmente tem as credenciais da Meta. */
  autoDispatch: boolean;
}

/**
 * Porta única de acionamento, usada pelos três gatilhos (SosFab, MapSosButton
 * e a rota /sos) através do mesmo hook.
 *
 * A idempotência não é feita aqui e sim no banco: `sos_open` é atômica e
 * devolve o evento existente quando o request_id repete ou quando o usuário já
 * tem um SOS aberto. Dois cliques simultâneos produzem UM registro.
 */
export const triggerSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TriggerInput.parse(input))
  .handler(async ({ data, context }): Promise<TriggerSosResult> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", userId)
      .maybeSingle();

    const { data: rows, error } = await supabase.rpc("sos_open", {
      _request_id: data.requestId,
      _lat: data.lat,
      _lng: data.lng,
      _accuracy_m: data.accuracy ?? undefined,
      _fix_age_ms: data.fixAgeMs ?? undefined,
      _note: data.note ?? undefined,
    });

    const row = Array.isArray(rows) ? rows[0] : null;
    if (error || !row) {
      console.error("[sos] sos_open falhou", error);
      throw new Error(error?.message ?? "Não foi possível registrar o SOS.");
    }

    const { isWhatsAppConfigured } = await import("./sos.server");

    return {
      sosEventId: row.sos_event_id,
      requestId: row.request_id,
      status: row.status,
      reused: row.reused,
      triggeredAt: row.triggered_at,
      queued: row.queued,
      profile: { name: profile?.name ?? "Motociclista", phone: profile?.phone ?? "" },
      autoDispatch: isWhatsAppConfigured(),
    };
  });

export interface DispatchSosResult {
  sosEventId: string;
  claimed: number;
  accepted: number;
  failed: number;
  unknown?: number;
  disabled?: boolean;
}

/**
 * Envio automático pela Cloud API da Meta.
 *
 * Ordem obrigatória: CLAIM atômico primeiro, chamada externa depois. A função
 * `claim_sos_notifications` usa FOR UPDATE SKIP LOCKED, então dois processos
 * concorrentes não pegam a mesma linha. Resultados externos incertos ficam
 * suspensos para reconciliação, sem reenvio automático.
 *
 * `accepted` significa que a API aceitou o payload — e nada além disso. A
 * confirmação de entrega só chega pelo webhook de status, que é o único
 * caminho para o status 'delivered' no banco.
 */
export const dispatchSosNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DispatchInput.parse(input))
  .handler(async ({ data, context }): Promise<DispatchSosResult> => {
    const { supabase, userId } = context;

    // O select passa pela RLS: garante que o evento é mesmo deste usuário.
    const { data: sos, error: sosErr } = await supabase
      .from("sos_events")
      .select("id, user_id, latitude, longitude, triggered_at, status")
      .eq("id", data.sosEventId)
      .maybeSingle();
    if (sosErr || !sos) throw new Error("SOS não encontrado.");
    if (sos.user_id !== userId) throw new Error("Acesso negado.");
    if (sos.status === "cancelled" || sos.status === "resolved") {
      return { sosEventId: sos.id, claimed: 0, accepted: 0, failed: 0 };
    }

    const { dispatchDueSosNotifications } = await import("./sos-dispatch.server");
    const result = await dispatchDueSosNotifications({
      sosEventId: sos.id,
      onlyFailed: data.onlyFailed,
    });
    return { sosEventId: sos.id, ...result };
  });
