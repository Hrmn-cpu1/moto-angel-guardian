-- CHECKPOINT P0.2 — column reference "request_id" is ambiguous
CREATE OR REPLACE FUNCTION public.sos_open(
  _request_id  uuid,
  _lat         double precision,
  _lng         double precision,
  _accuracy_m  double precision DEFAULT NULL,
  _fix_age_ms  integer DEFAULT NULL,
  _note        text DEFAULT NULL
)
RETURNS TABLE (
  sos_event_id uuid,
  request_id   uuid,
  status       text,
  triggered_at timestamptz,
  reused       boolean,
  queued       integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_event  public.sos_events%ROWTYPE;
  v_reused boolean := false;
  v_queued integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: request_id e obrigatorio.'
      USING ERRCODE = '22023';
  END IF;

  IF _lat IS NULL OR _lng IS NULL
     OR NOT (_lat BETWEEN -90 AND 90)
     OR NOT (_lng BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: coordenada fora de faixa.'
      USING ERRCODE = '22023';
  END IF;

  IF _lat = 0 AND _lng = 0 THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: coordenada 0,0 nao e uma posicao real.'
      USING ERRCODE = '22023';
  END IF;

  IF _accuracy_m IS NOT NULL AND NOT (_accuracy_m BETWEEN 0 AND 500) THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: accuracy_m precisa estar entre 0 e 500 metros.'
      USING ERRCODE = '22023';
  END IF;

  IF _fix_age_ms IS NOT NULL AND NOT (_fix_age_ms BETWEEN 0 AND 60000) THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: fix_age_ms precisa estar entre 0 e 60000 ms.'
      USING ERRCODE = '22023';
  END IF;

  IF _note IS NOT NULL AND length(_note) > 500 THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: note passa de 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 20260806));

  SELECT se.* INTO v_event
    FROM public.sos_events se
   WHERE se.request_id = _request_id
     AND se.user_id = v_uid;

  IF FOUND THEN
    IF v_event.status <> 'active' THEN
      RAISE EXCEPTION
        'SOS_ENCERRADO: este acionamento ja foi encerrado (status %). Gere um novo request_id.',
        v_event.status
        USING ERRCODE = '22023';
    END IF;
    v_reused := true;

  ELSE
    SELECT se.* INTO v_event
      FROM public.sos_events se
     WHERE se.user_id = v_uid
       AND se.status = 'active'
     ORDER BY se.triggered_at DESC
     LIMIT 1;

    IF FOUND THEN
      v_reused := true;
    ELSE
      BEGIN
        INSERT INTO public.sos_events
          (user_id, request_id, latitude, longitude, accuracy_m, fix_age_ms, note, status)
        VALUES
          (v_uid, _request_id, _lat, _lng, _accuracy_m, _fix_age_ms, _note, 'active')
        RETURNING * INTO v_event;

      EXCEPTION
        WHEN unique_violation THEN
          v_reused := true;
          SELECT se.* INTO v_event
            FROM public.sos_events se
           WHERE se.user_id = v_uid
             AND se.status = 'active'
           ORDER BY se.triggered_at DESC
           LIMIT 1;

          IF NOT FOUND THEN
            SELECT se.* INTO v_event
              FROM public.sos_events se
             WHERE se.request_id = _request_id
               AND se.user_id = v_uid;
          END IF;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Nao foi possivel registrar o SOS apos colisao de concorrencia.';
          END IF;
      END;
    END IF;
  END IF;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel registrar o SOS.';
  END IF;

  INSERT INTO public.whatsapp_notifications
    (sos_event_id, user_id, emergency_contact_id, recipient_name, recipient_phone, provider, status)
  SELECT v_event.id, v_uid, c.id, COALESCE(c.name,''), c.phone, 'meta_whatsapp', 'queued'
    FROM public.emergency_contacts c
   WHERE c.user_id = v_uid
     AND c.phone IS NOT NULL
     AND length(btrim(c.phone)) > 0
  ON CONFLICT DO NOTHING;

  SELECT count(*)::integer INTO v_queued
    FROM public.whatsapp_notifications wn
   WHERE wn.sos_event_id = v_event.id;

  RETURN QUERY SELECT v_event.id, v_event.request_id, v_event.status,
                      v_event.triggered_at, v_reused, v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) IS
  'Unica porta de abertura de SOS. Valida entrada, serializa por usuario com advisory lock e trata unique_violation. Recusa request_id de evento ja encerrado. Referencias de coluna qualificadas: os nomes do RETURNS TABLE tambem sao variaveis PL/pgSQL.';

CREATE OR REPLACE FUNCTION public.sos_cancel(_sos_event_id uuid, _reason text DEFAULT NULL)
RETURNS TABLE (sos_event_id uuid, status text, cancelled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.sos_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sos_events se
     SET status = 'cancelled',
         cancel_reason = COALESCE(_reason, se.cancel_reason)
   WHERE se.id = _sos_event_id
     AND se.user_id = v_uid
     AND se.status NOT IN ('cancelled','resolved')
  RETURNING se.* INTO v_row;

  IF NOT FOUND THEN
    SELECT se.* INTO v_row
      FROM public.sos_events se
     WHERE se.id = _sos_event_id
       AND se.user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOS nao encontrado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.whatsapp_notifications wn
     SET status = 'cancelled'
   WHERE wn.sos_event_id = v_row.id
     AND wn.status IN ('queued','failed');

  RETURN QUERY SELECT v_row.id, v_row.status, v_row.cancelled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_cancel(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_cancel(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sos_resolve(_sos_event_id uuid)
RETURNS TABLE (sos_event_id uuid, status text, resolved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.sos_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sos_events se
     SET status = 'resolved'
   WHERE se.id = _sos_event_id
     AND se.user_id = v_uid
     AND se.status NOT IN ('cancelled','resolved')
  RETURNING se.* INTO v_row;

  IF NOT FOUND THEN
    SELECT se.* INTO v_row
      FROM public.sos_events se
     WHERE se.id = _sos_event_id
       AND se.user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOS nao encontrado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.status, v_row.resolved_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_resolve(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_resolve(uuid) TO authenticated, service_role;