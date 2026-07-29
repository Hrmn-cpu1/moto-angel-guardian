import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TriggerInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(500).optional().nullable(),
});

const DispatchInput = z.object({
  sosEventId: z.string().uuid(),
  onlyFailed: z.boolean().optional().default(false),
});

export const triggerSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TriggerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", userId)
      .maybeSingle();

    const { data: sosRow, error: sosErr } = await supabase
      .from("sos_events")
      .insert({
        user_id: userId,
        latitude: data.lat,
        longitude: data.lng,
        status: "active",
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (sosErr || !sosRow) {
      console.error("[sos] failed to create event", sosErr);
      throw new Error("Não foi possível registrar o SOS.");
    }

    const { data: contactsRaw } = await supabase
      .from("emergency_contacts")
      .select("id, name, phone")
      .eq("user_id", userId);
    const contacts = (contactsRaw ?? []).filter((c) => c.phone && c.phone.trim().length > 0);

    if (contacts.length === 0) {
      return {
        sosEventId: sosRow.id,
        profile: { name: profile?.name ?? "Motociclista", phone: profile?.phone ?? "" },
        queued: 0,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = contacts.map((c) => ({
      sos_event_id: sosRow.id,
      user_id: userId,
      emergency_contact_id: c.id,
      recipient_name: c.name,
      recipient_phone: c.phone,
      provider: "meta_whatsapp",
      status: "queued",
    }));
    const { error: insErr } = await supabaseAdmin.from("whatsapp_notifications").insert(rows);
    if (insErr) {
      console.error("[sos] failed to queue notifications", insErr);
      throw new Error("Falha ao preparar envios.");
    }

    return {
      sosEventId: sosRow.id,
      profile: { name: profile?.name ?? "Motociclista", phone: profile?.phone ?? "" },
      queued: rows.length,
    };
  });

export const dispatchSosNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DispatchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sos, error: sosErr } = await supabase
      .from("sos_events")
      .select("id, user_id, latitude, longitude, triggered_at")
      .eq("id", data.sosEventId)
      .maybeSingle();
    if (sosErr || !sos) throw new Error("SOS não encontrado.");
    if (sos.user_id !== userId) throw new Error("Acesso negado.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildSosMessage, sendWhatsAppText } = await import("./sos.server");

    const q = supabaseAdmin
      .from("whatsapp_notifications")
      .select("id, recipient_name, recipient_phone, status, attempts")
      .eq("sos_event_id", sos.id);
    if (data.onlyFailed) q.eq("status", "failed");
    const { data: pending, error: pErr } = await q;
    if (pErr) throw new Error("Falha ao listar notificações.");

    const toSend = (pending ?? []).filter((n) => n.status !== "sent");
    if (toSend.length === 0) {
      return { sosEventId: sos.id, dispatched: 0, sent: 0, failed: 0 };
    }

    const body = buildSosMessage({
      name: profile?.name ?? "Motociclista",
      phone: profile?.phone ?? "",
      lat: Number(sos.latitude),
      lng: Number(sos.longitude),
      when: new Date(sos.triggered_at as string),
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      toSend.map(async (n) => {
        const result = await sendWhatsAppText(n.recipient_phone, body);
        const patch = result.ok
          ? {
              status: "sent",
              provider_message_id: result.providerMessageId,
              error_message: null,
              sent_at: new Date().toISOString(),
              attempts: (n.attempts ?? 0) + 1,
            }
          : {
              status: "failed",
              error_message: result.error.slice(0, 500),
              attempts: (n.attempts ?? 0) + 1,
            };
        if (result.ok) sent += 1;
        else failed += 1;
        const { error: upErr } = await supabaseAdmin
          .from("whatsapp_notifications")
          .update(patch)
          .eq("id", n.id);
        if (upErr) console.error("[sos] update notification failed", n.id, upErr);
      }),
    );

    const finalStatus = failed === 0 ? "notified" : sent === 0 ? "failed" : "partial";
    await supabaseAdmin
      .from("sos_events")
      .update({ status: finalStatus })
      .eq("id", sos.id);

    return { sosEventId: sos.id, dispatched: toSend.length, sent, failed };
  });