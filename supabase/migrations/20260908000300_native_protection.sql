-- Per-trip bearer scope: open SOS only. Never an Auth access/refresh token.
CREATE TABLE public.native_protection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  trip_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (user_id, device_id)
);
ALTER TABLE public.native_protection_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_protection_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.native_protection_sessions TO service_role;

CREATE FUNCTION public.native_protection_create(
  _user_id uuid, _device_id uuid, _trip_started_at timestamptz, _token_hash text
) RETURNS TABLE (session_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF _user_id IS NULL OR _device_id IS NULL OR _trip_started_at IS NULL
    OR _trip_started_at > now() + interval '1 minute'
    OR _trip_started_at <= now() - interval '12 hours'
    OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid native protection session' USING ERRCODE = '22023';
  END IF;
  -- Upsert serializes rotation for this user/device; another device is untouched.
  RETURN QUERY
  INSERT INTO public.native_protection_sessions AS s
    (user_id, device_id, token_hash, trip_started_at, expires_at)
  VALUES (_user_id, _device_id, _token_hash, _trip_started_at,
    LEAST(now() + interval '12 hours', _trip_started_at + interval '12 hours'))
  ON CONFLICT (user_id, device_id) DO UPDATE SET
    id = gen_random_uuid(), token_hash = EXCLUDED.token_hash,
    trip_started_at = EXCLUDED.trip_started_at, expires_at = EXCLUDED.expires_at,
    revoked_at = NULL
  RETURNING s.id, s.expires_at;
END;
$$;

CREATE FUNCTION public.native_protection_revoke(_user_id uuid, _session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.native_protection_sessions AS s SET revoked_at = COALESCE(s.revoked_at, now())
    WHERE s.id = _session_id AND s.user_id = _user_id;
  -- Idempotent and reveals nothing about a different owner's id.
  RETURN true;
END;
$$;

CREATE FUNCTION public.native_protection_sos_open(
  _token_hash text, _request_id uuid, _lat double precision, _lng double precision,
  _accuracy_m double precision, _fix_age_ms integer, _source text
) RETURNS TABLE (
  sos_event_id uuid, request_id uuid, status text,
  triggered_at timestamptz, reused boolean, queued integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid;
  v_known_event public.sos_events%ROWTYPE;
  v_original_sub text := current_setting('request.jwt.claim.sub', true);
  v_original_claims text := current_setting('request.jwt.claims', true);
BEGIN
  -- Lock pairs with revoke/rotation: neither can acknowledge completion while
  -- this token is opening an event. The existing sos_open serializes users.
  SELECT s.user_id INTO v_user_id FROM public.native_protection_sessions AS s
    WHERE s.token_hash = _token_hash AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    FOR SHARE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized native protection token' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL OR _lat IS NULL OR _lng IS NULL
    OR NOT (_lat BETWEEN -90 AND 90) OR NOT (_lng BETWEEN -180 AND 180)
    OR (_lat = 0 AND _lng = 0)
    OR _accuracy_m IS NULL OR NOT (_accuracy_m BETWEEN 0 AND 500)
    OR _fix_age_ms IS NULL OR NOT (_fix_age_ms BETWEEN 0 AND 60000)
    OR _source IS NULL OR _source NOT IN ('manual', 'crash') THEN
    RAISE EXCEPTION 'Invalid native SOS input' USING ERRCODE = '22023';
  END IF;
  -- Uniform lock order across opening/cancellation: session, user, event.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 20260806));
  -- A response can be lost after registration and the user can close the SOS
  -- before Android retries its persisted UUID. Return the owner's terminal
  -- record without calling sos_open: no new event or queued contacts appear.
  -- The row lock also serializes this lookup with a concurrent cancellation.
  SELECT se.* INTO v_known_event FROM public.sos_events AS se
    WHERE se.user_id = v_user_id AND se.request_id = _request_id
    FOR SHARE;
  IF FOUND AND v_known_event.status IN ('cancelled', 'resolved') THEN
    RETURN QUERY SELECT v_known_event.id, v_known_event.request_id,
      v_known_event.status, v_known_event.triggered_at, true,
      (SELECT count(*)::integer FROM public.whatsapp_notifications AS wn
        WHERE wn.sos_event_id = v_known_event.id);
    RETURN;
  END IF;
  -- The owner comes exclusively from the hashed capability. RPC access is
  -- service_role-only; no caller-controlled owner/claims are accepted.
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);
  RETURN QUERY SELECT r.* FROM public.sos_open(
    _request_id, _lat, _lng, _accuracy_m, _fix_age_ms,
    CASE WHEN _source = 'crash' THEN 'Acionamento nativo por possível queda.'
      ELSE 'Acionamento manual nativo.' END
  ) AS r;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_original_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_original_claims, ''), true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_original_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_original_claims, ''), true);
  RAISE;
END;
$$;

-- A user may withdraw an uncertain native request even after its bearer expired.
-- Session identity, rather than the bearer, is authorized by the server function.
CREATE FUNCTION public.native_protection_cancel_pending(
  _user_id uuid, _session_id uuid, _request_id uuid
) RETURNS TABLE (cancelled boolean, sos_event_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session uuid;
  v_event public.sos_events%ROWTYPE;
  v_status text;
  v_original_sub text := current_setting('request.jwt.claim.sub', true);
  v_original_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF _user_id IS NULL OR _session_id IS NULL OR _request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid pending request cancellation' USING ERRCODE = '22023';
  END IF;
  -- Wait for any in-flight open using this exact session. The update also
  -- prevents a later native retry from entering sos_open after confirmation.
  UPDATE public.native_protection_sessions AS s
    SET revoked_at = COALESCE(s.revoked_at, clock_timestamp())
    WHERE s.id = _session_id AND s.user_id = _user_id
    RETURNING s.id INTO v_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Native session changed or unavailable' USING ERRCODE = '42501';
  END IF;
  -- Same ordering as native opens: session first, then per-owner SOS lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 20260806));
  SELECT se.* INTO v_event FROM public.sos_events AS se
    WHERE se.user_id = _user_id AND se.request_id = _request_id FOR UPDATE;
  IF FOUND THEN
    PERFORM set_config('request.jwt.claim.sub', _user_id::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
    SELECT r.status INTO v_status FROM public.sos_cancel(v_event.id, 'Pedido nativo cancelado pelo usuário.') AS r;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_original_sub, ''), true);
    PERFORM set_config('request.jwt.claims', COALESCE(v_original_claims, ''), true);
  ELSE
    v_status := 'absent';
  END IF;
  -- A request may have reused an older event whose response was lost. Do not
  -- call that absence cancellation, or cancel an unrelated active SOS blindly.
  IF EXISTS (SELECT 1 FROM public.sos_events AS se WHERE se.user_id = _user_id AND se.status = 'active') THEN
    RAISE EXCEPTION 'An active SOS requires review' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('cancelled', 'resolved', 'absent') OR v_status IS NULL THEN
    RAISE EXCEPTION 'Pending request cancellation was not confirmed';
  END IF;
  RETURN QUERY SELECT true, v_event.id, v_status;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_original_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_original_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.native_protection_cancel_pending(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.native_protection_cancel_pending(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.native_protection_create(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.native_protection_revoke(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.native_protection_sos_open(text, uuid, double precision, double precision, double precision, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.native_protection_create(uuid, uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.native_protection_revoke(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.native_protection_sos_open(text, uuid, double precision, double precision, double precision, integer, text) TO service_role;
