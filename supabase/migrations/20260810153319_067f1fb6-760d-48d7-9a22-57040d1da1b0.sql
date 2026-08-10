-- ============================================================================
-- CHECKPOINT 1 — Unificação do SOS (parte 1 de 2): o evento
--
-- Migration ADITIVA. Não altera nem apaga nada das 23 migrations anteriores.
-- Tudo aqui é IF NOT EXISTS / OR REPLACE para poder ser reaplicada sem estrago.
--
-- O que esta migration garante no banco (não só na tela):
--   1. request_id UUID único por evento  -> idempotência de verdade
--   2. no máximo UM SOS ativo por usuário -> índice parcial único
--   3. cancelamento e resolução com carimbo de data/hora persistido
--   4. uma única porta de entrada (sos_open) que abre OU devolve o existente
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas
-- ----------------------------------------------------------------------------
ALTER TABLE public.sos_events
  ADD COLUMN IF NOT EXISTS request_id   uuid,
  ADD COLUMN IF NOT EXISTS accuracy_m   numeric,
  ADD COLUMN IF NOT EXISTS fix_age_ms   integer,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Eventos antigos ganham um request_id próprio para não colidirem entre si.
UPDATE public.sos_events SET request_id = gen_random_uuid() WHERE request_id IS NULL;
ALTER TABLE public.sos_events ALTER COLUMN request_id SET DEFAULT gen_random_uuid();

-- ----------------------------------------------------------------------------
-- 2. Higiene antes de criar as restrições
--    Sem isso, um banco que já tenha dois eventos "active" do mesmo usuário
--    faria a migration falhar na criação do índice único.
-- ----------------------------------------------------------------------------
UPDATE public.sos_events
   SET status = 'expired'
 WHERE status = 'active'
   AND triggered_at < now() - interval '12 hours';

WITH ranqueado AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY triggered_at DESC, id DESC) AS pos
    FROM public.sos_events
   WHERE status = 'active'
)
UPDATE public.sos_events s
   SET status = 'superseded'
  FROM ranqueado r
 WHERE s.id = r.id AND r.pos > 1;

-- ----------------------------------------------------------------------------
-- 3. Restrições
-- ----------------------------------------------------------------------------

-- 3.1 Idempotência: o mesmo request_id nunca abre um segundo evento.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sos_events_request_id
  ON public.sos_events (request_id);

-- 3.2 Um único SOS ativo por usuário, garantido pelo banco e não pela tela.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sos_events_um_ativo_por_usuario
  ON public.sos_events (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sos_events_user_status
  ON public.sos_events (user_id, status, triggered_at DESC);

-- 3.3 Vocabulário fechado de status.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_sos_events_status'
  ) THEN
    ALTER TABLE public.sos_events
      ADD CONSTRAINT ck_sos_events_status CHECK (
        status IN ('active','cancelled','resolved','notified','partial','failed','expired','superseded')
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Carimbo automático de cancelamento e resolução
--    O cliente só precisa mudar o status; o banco registra QUANDO aconteceu.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sos_stamp_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
    IF NEW.status IN ('resolved','notified') AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  END IF;

  -- Um evento encerrado não volta a ficar ativo por caminho lateral.
  IF OLD.status IN ('cancelled','resolved') AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Um SOS encerrado nao pode ser reaberto. Abra um novo acionamento.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_stamp_status ON public.sos_events;
CREATE TRIGGER trg_sos_stamp_status
  BEFORE UPDATE ON public.sos_events
  FOR EACH ROW EXECUTE FUNCTION public.sos_stamp_status();

-- ----------------------------------------------------------------------------
-- 5. sos_open — porta ÚNICA de acionamento
--
--    Chamada pelos três acionadores através da mesma server function.
--    Devolve `reused = true` quando o pedido já tinha sido atendido (retry de
--    rede, duplo toque, reenvio depois de recuperar a conexão) ou quando o
--    usuário já tem um SOS aberto. Nunca cria o segundo evento.
-- ----------------------------------------------------------------------------
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
  v_uid       uuid := auth.uid();
  v_event     public.sos_events%ROWTYPE;
  v_reused    boolean := false;
  v_queued    integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'request_id e obrigatorio para um acionamento idempotente.';
  END IF;

  -- Coordenada precisa ser real. O banco é a última barreira; a primeira está
  -- no cliente (validateSosFix) e a segunda na server function.
  IF _lat IS NULL OR _lng IS NULL
     OR _lat < -90 OR _lat > 90
     OR _lng < -180 OR _lng > 180
     OR (_lat = 0 AND _lng = 0) THEN
    RAISE EXCEPTION 'Coordenada invalida para um acionamento de emergencia.';
  END IF;

  -- (a) Este pedido exato já foi atendido?
  SELECT * INTO v_event
    FROM public.sos_events
   WHERE request_id = _request_id AND user_id = v_uid;

  IF FOUND THEN
    v_reused := true;
  ELSE
    -- (b) Já existe um SOS aberto? Então devolve ele em vez de abrir outro.
    SELECT * INTO v_event
      FROM public.sos_events
     WHERE user_id = v_uid AND status = 'active'
     ORDER BY triggered_at DESC
     LIMIT 1;

    IF FOUND THEN
      v_reused := true;
    ELSE
      -- (c) Caminho normal: abre o evento.
      INSERT INTO public.sos_events
        (user_id, request_id, latitude, longitude, accuracy_m, fix_age_ms, note, status)
      VALUES
        (v_uid, _request_id, _lat, _lng, _accuracy_m, _fix_age_ms, _note, 'active')
      ON CONFLICT (request_id) DO NOTHING
      RETURNING * INTO v_event;

      -- Corrida perdida para outra aba/aparelho: releia o vencedor.
      IF NOT FOUND THEN
        SELECT * INTO v_event
          FROM public.sos_events
         WHERE request_id = _request_id AND user_id = v_uid;
        v_reused := true;
      END IF;
    END IF;
  END IF;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel registrar o SOS.';
  END IF;

  -- Enfileira os contatos. ON CONFLICT cobre a reentrada: o mesmo contato
  -- nunca entra duas vezes na fila do mesmo evento.
  INSERT INTO public.whatsapp_notifications
    (sos_event_id, user_id, emergency_contact_id, recipient_name, recipient_phone, provider, status)
  SELECT v_event.id, v_uid, c.id, COALESCE(c.name,''), c.phone, 'meta_whatsapp', 'queued'
    FROM public.emergency_contacts c
   WHERE c.user_id = v_uid
     AND c.phone IS NOT NULL
     AND length(btrim(c.phone)) > 0
  ON CONFLICT DO NOTHING;

  SELECT count(*)::integer INTO v_queued
    FROM public.whatsapp_notifications
   WHERE sos_event_id = v_event.id;

  RETURN QUERY SELECT v_event.id, v_event.request_id, v_event.status,
                      v_event.triggered_at, v_reused, v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Cancelamento e resolução persistidos
-- ----------------------------------------------------------------------------
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

  UPDATE public.sos_events
     SET status = 'cancelled',
         cancel_reason = COALESCE(_reason, cancel_reason)
   WHERE id = _sos_event_id
     AND user_id = v_uid
     AND status NOT IN ('cancelled','resolved')
  RETURNING * INTO v_row;

  -- Já cancelado antes: devolve o estado atual em vez de estourar erro.
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.sos_events
     WHERE id = _sos_event_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOS nao encontrado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- O que ainda não saiu não deve sair depois de um cancelamento.
  UPDATE public.whatsapp_notifications
     SET status = 'cancelled'
   WHERE sos_event_id = v_row.id
     AND status IN ('queued','failed');

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

  UPDATE public.sos_events
     SET status = 'resolved'
   WHERE id = _sos_event_id AND user_id = v_uid AND status NOT IN ('cancelled','resolved')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.sos_events WHERE id = _sos_event_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOS nao encontrado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.status, v_row.resolved_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_resolve(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_resolve(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Recuperação: o app pergunta ao banco se ainda existe um SOS aberto.
--    É isto que faz o alerta sobreviver a um F5 ou a uma troca de aparelho.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sos_active_event()
RETURNS TABLE (
  sos_event_id uuid,
  request_id   uuid,
  latitude     numeric,
  longitude    numeric,
  accuracy_m   numeric,
  note         text,
  status       text,
  triggered_at timestamptz,
  queued       integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id, s.request_id, s.latitude, s.longitude, s.accuracy_m, s.note,
         s.status, s.triggered_at,
         (SELECT count(*)::integer FROM public.whatsapp_notifications w
           WHERE w.sos_event_id = s.id)
    FROM public.sos_events s
   WHERE s.user_id = auth.uid()
     AND s.status = 'active'
     AND s.triggered_at > now() - interval '12 hours'
   ORDER BY s.triggered_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.sos_active_event() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_active_event() TO authenticated, service_role;

COMMENT ON COLUMN public.sos_events.request_id IS
  'UUID gerado no cliente. Chave de idempotencia: o mesmo valor devolve o mesmo evento.';
COMMENT ON COLUMN public.sos_events.accuracy_m IS
  'Raio de erro do GPS em metros no instante do acionamento. Acima de 500 m o cliente recusa.';
COMMENT ON INDEX public.ux_sos_events_um_ativo_por_usuario IS
  'Garante no banco que cada usuario tem no maximo um SOS com status active.';