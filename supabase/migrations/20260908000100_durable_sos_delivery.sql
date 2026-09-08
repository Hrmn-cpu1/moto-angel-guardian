-- Durable dispatch. This migration schedules nothing and sends no messages.
ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE public.whatsapp_notifications DROP CONSTRAINT IF EXISTS ck_wn_status;
ALTER TABLE public.whatsapp_notifications ADD CONSTRAINT ck_wn_status CHECK (
  status IN ('queued','sending','sent','delivered','read','failed','cancelled','unknown')
);
CREATE INDEX IF NOT EXISTS idx_wn_dispatch_due ON public.whatsapp_notifications(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_wn_provider_id ON public.whatsapp_notifications(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Keep only receipt metadata, never the webhook body or contact details.
CREATE TABLE IF NOT EXISTS public.sos_delivery_receipts (
  provider_message_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('sent','failed','delivered','read')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sos_delivery_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sos_delivery_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sos_delivery_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.sos_receipt_rank(_status text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE _status WHEN 'sent' THEN 1 WHEN 'failed' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.sos_receipt_rank(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_receipt_rank(text) TO service_role;

-- Used both after settlement and on receipt arrival. Monotonic and idempotent.
CREATE OR REPLACE FUNCTION public.apply_sos_delivery_receipt(_provider_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed integer;
BEGIN
 UPDATE public.whatsapp_notifications w
 SET status = r.status,
     delivered_at = CASE WHEN r.status IN ('delivered','read') THEN COALESCE(w.delivered_at,r.occurred_at) ELSE w.delivered_at END,
     error_message = CASE WHEN r.status = 'failed' THEN 'O WhatsApp confirmou falha na entrega.' ELSE NULL END,
     retryable = false, next_attempt_at = NULL
 FROM public.sos_delivery_receipts r
 WHERE r.provider_message_id = _provider_message_id AND w.provider_message_id = r.provider_message_id
   AND w.status IN ('sending','unknown','sent','failed','delivered','read')
   AND public.sos_receipt_rank(r.status) >= public.sos_receipt_rank(w.status);
 GET DIAGNOSTICS v_changed = ROW_COUNT;
 RETURN v_changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_sos_delivery_receipt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sos_delivery_receipt(text) TO service_role;

CREATE OR REPLACE FUNCTION public.receive_sos_delivery(
 _provider_message_id text, _status text, _occurred_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _provider_message_id IS NULL OR length(_provider_message_id) NOT BETWEEN 1 AND 512
    OR _status NOT IN ('sent','failed','delivered','read') OR _occurred_at IS NULL THEN
   RAISE EXCEPTION 'Invalid delivery receipt';
 END IF;
 -- The same advisory lock in settle closes receipt-before-settle races, including
 -- simultaneous transactions where each would otherwise miss the other's write.
 PERFORM pg_advisory_xact_lock(hashtextextended(_provider_message_id, 0));
 INSERT INTO public.sos_delivery_receipts(provider_message_id,status,occurred_at)
 VALUES (_provider_message_id,_status,_occurred_at)
 ON CONFLICT (provider_message_id) DO UPDATE
 SET status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at, received_at = now()
 WHERE public.sos_receipt_rank(EXCLUDED.status) > public.sos_receipt_rank(sos_delivery_receipts.status);
 PERFORM public.apply_sos_delivery_receipt(_provider_message_id);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_sos_delivery(text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_sos_delivery(text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_sos_notifications(
 _claim_token uuid, _sos_event_id uuid DEFAULT NULL, _only_failed boolean DEFAULT false, _max integer DEFAULT 10
) RETURNS TABLE (
 id uuid, sos_event_id uuid, recipient_phone text, attempts integer,
 rider_name text, rider_phone text, latitude double precision, longitude double precision, triggered_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _claim_token IS NULL THEN RAISE EXCEPTION 'claim token required'; END IF;
 -- A dead worker may have sent externally. Never turn an abandoned lease into retry.
 UPDATE public.whatsapp_notifications w SET status = 'unknown', retryable = false,
   next_attempt_at = NULL, error_message = 'Envio interrompido: resultado não confirmado.',
   claim_token = NULL, claimed_at = NULL
 WHERE w.status = 'sending' AND w.claimed_at < now() - interval '2 minutes';
 -- Do not send old SOS notifications merely because credentials were enabled later.
 UPDATE public.whatsapp_notifications w SET status = 'failed', retryable = false,
   next_attempt_at = NULL, error_message = 'Janela de envio automático encerrada. Confira o contato manual.'
 FROM public.sos_events s WHERE w.sos_event_id = s.id
   AND (w.status = 'queued' OR (w.status = 'failed' AND w.retryable))
   AND s.triggered_at < now() - interval '15 minutes';
 RETURN QUERY
 WITH candidate AS (
   SELECT w.id FROM public.whatsapp_notifications w JOIN public.sos_events s ON s.id = w.sos_event_id
   WHERE s.status = 'active' AND s.triggered_at >= now() - interval '15 minutes'
     AND (_sos_event_id IS NULL OR w.sos_event_id = _sos_event_id)
     AND ((NOT _only_failed AND w.status = 'queued') OR (w.status = 'failed' AND w.retryable))
     AND (w.next_attempt_at IS NULL OR w.next_attempt_at <= now()) AND w.attempts < 3
   ORDER BY w.created_at, w.id LIMIT LEAST(GREATEST(_max,1),20)
   FOR UPDATE OF w SKIP LOCKED
 ), claimed AS (
   UPDATE public.whatsapp_notifications w SET status = 'sending', claim_token = _claim_token,
     claimed_at = now(), attempts = w.attempts + 1, retryable = false, next_attempt_at = NULL
   FROM candidate c WHERE w.id = c.id RETURNING w.*
 )
 SELECT c.id,c.sos_event_id,c.recipient_phone,c.attempts,COALESCE(p.name,'Motociclista'),COALESCE(p.phone,''),
   s.latitude::double precision,s.longitude::double precision,s.triggered_at
 FROM claimed c JOIN public.sos_events s ON s.id = c.sos_event_id LEFT JOIN public.profiles p ON p.id = c.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_sos_notifications(uuid,uuid,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_sos_notifications(uuid,uuid,boolean,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_sos_dispatch(
 _id uuid, _claim_token uuid, _outcome text, _provider_message_id text DEFAULT NULL,
 _error text DEFAULT NULL, _retryable boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed integer;
BEGIN
 IF _outcome NOT IN ('sent','failed','unknown') OR (_outcome = 'sent' AND COALESCE(length(_provider_message_id),0) = 0) THEN
  RAISE EXCEPTION 'Invalid send outcome';
 END IF;
 IF _provider_message_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_provider_message_id, 0));
 END IF;
 UPDATE public.whatsapp_notifications w SET status = _outcome,
   provider_message_id = COALESCE(_provider_message_id,w.provider_message_id),
   sent_at = CASE WHEN _outcome = 'sent' THEN now() ELSE w.sent_at END,
   error_message = CASE WHEN _outcome = 'sent' THEN NULL ELSE left(COALESCE(_error,'Resultado não confirmado.'),500) END,
   retryable = _outcome = 'failed' AND _retryable AND w.attempts < 3,
   next_attempt_at = CASE WHEN _outcome = 'failed' AND _retryable AND w.attempts < 3 THEN now() + interval '1 minute' * w.attempts ELSE NULL END,
   claim_token = NULL, claimed_at = NULL
 WHERE w.id = _id AND w.claim_token = _claim_token AND w.status = 'sending';
 GET DIAGNOSTICS v_changed = ROW_COUNT;
 IF v_changed > 0 AND _provider_message_id IS NOT NULL THEN
  PERFORM public.apply_sos_delivery_receipt(_provider_message_id);
 END IF;
 RETURN v_changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_sos_dispatch(uuid,uuid,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sos_dispatch(uuid,uuid,text,text,text,boolean) TO service_role;

-- Preserve old interfaces during rollout, but never restore unsafe stale retry.
CREATE OR REPLACE FUNCTION public.claim_sos_notifications(
 _sos_event_id uuid, _claim_token uuid, _only_failed boolean DEFAULT false,
 _max integer DEFAULT 20, _stale_after interval DEFAULT interval '2 minutes'
) RETURNS TABLE (id uuid, recipient_name text, recipient_phone text, attempts integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT q.id, w.recipient_name, q.recipient_phone, q.attempts
 FROM public.claim_due_sos_notifications(_claim_token,_sos_event_id,_only_failed,_max) q
 JOIN public.whatsapp_notifications w ON w.id = q.id;
$$;
CREATE OR REPLACE FUNCTION public.settle_sos_notification(
 _id uuid, _claim_token uuid, _ok boolean, _provider_message_id text DEFAULT NULL, _error text DEFAULT NULL
) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT public.settle_sos_dispatch(_id,_claim_token,
   CASE WHEN _ok AND COALESCE(length(_provider_message_id),0) > 0 THEN 'sent' ELSE 'unknown' END,
   _provider_message_id,_error,false);
$$;
CREATE OR REPLACE FUNCTION public.mark_sos_notification_delivered(
 _provider_message_id text, _status text DEFAULT 'delivered', _occurred_at timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _status NOT IN ('delivered','read') THEN RAISE EXCEPTION 'Only delivered/read allowed'; END IF;
 RETURN public.receive_sos_delivery(_provider_message_id,_status,_occurred_at);
END;
$$;
-- Explicit grants also protect installs with unexpected legacy privileges.
REVOKE ALL ON FUNCTION public.claim_sos_notifications(uuid,uuid,boolean,integer,interval) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_sos_notification(uuid,uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_sos_notification_delivered(text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sos_notifications(uuid,uuid,boolean,integer,interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_sos_notification(uuid,uuid,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_sos_notification_delivered(text,text,timestamptz) TO service_role;
