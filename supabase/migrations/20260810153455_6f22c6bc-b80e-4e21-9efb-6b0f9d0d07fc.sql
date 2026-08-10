-- ============================================================================
-- CHECKPOINT 1 — Unificação do SOS (parte 2 de 2): a fila de notificações
--
-- Migration ADITIVA. Não altera nem apaga nada das migrations anteriores.
--
-- O que esta migration garante:
--   1. o mesmo contato nunca recebe duas mensagens do mesmo SOS (constraint)
--   2. nenhum envio externo acontece sem um CLAIM atômico da linha
--   3. 'delivered' só entra por webhook do provedor — nunca pelo app
--   4. linhas travadas em 'sending' voltam sozinhas para a fila
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS request_id      uuid,
  ADD COLUMN IF NOT EXISTS claim_token     uuid,
  ADD COLUMN IF NOT EXISTS claimed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------------------------
-- 2. Higiene antes das restrições
--    Remove duplicatas já existentes (mesmo evento + mesmo telefone),
--    preservando a linha mais informativa: enviada > tentada > mais antiga.
-- ----------------------------------------------------------------------------
WITH ranqueado AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY sos_event_id, regexp_replace(COALESCE(recipient_phone,''), '\D', '', 'g')
           ORDER BY (status = 'sent') DESC, attempts DESC, created_at ASC, id ASC
         ) AS pos
    FROM public.whatsapp_notifications
)
DELETE FROM public.whatsapp_notifications w
 USING ranqueado r
 WHERE w.id = r.id AND r.pos > 1;

-- ----------------------------------------------------------------------------
-- 3. Restrições anti-duplicata
-- ----------------------------------------------------------------------------

-- 3.1 Um contato cadastrado, uma notificação por evento.
CREATE UNIQUE INDEX IF NOT EXISTS ux_wn_evento_contato
  ON public.whatsapp_notifications (sos_event_id, emergency_contact_id)
  WHERE emergency_contact_id IS NOT NULL;

-- 3.2 Guarda semântica de verdade: o mesmo NÚMERO nunca recebe duas mensagens
--     do mesmo SOS, mesmo que a pessoa tenha o número repetido em dois
--     contatos ou que o contato tenha sido apagado (emergency_contact_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS ux_wn_evento_telefone
  ON public.whatsapp_notifications (sos_event_id, (regexp_replace(COALESCE(recipient_phone,''), '\D', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_wn_fila
  ON public.whatsapp_notifications (sos_event_id, status);

-- 3.3 Vocabulário fechado de status.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_wn_status') THEN
    ALTER TABLE public.whatsapp_notifications
      ADD CONSTRAINT ck_wn_status CHECK (
        status IN ('queued','sending','sent','delivered','read','failed','cancelled')
      );
  END IF;
END $$;

-- 3.4 Coerência: só existe delivered_at quando o status é de entrega.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_wn_delivered_coerente') THEN
    ALTER TABLE public.whatsapp_notifications
      ADD CONSTRAINT ck_wn_delivered_coerente CHECK (
        (delivered_at IS NULL) OR (status IN ('delivered','read'))
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.wn_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_status_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wn_touch ON public.whatsapp_notifications;
CREATE TRIGGER trg_wn_touch
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW EXECUTE FUNCTION public.wn_touch();

-- ----------------------------------------------------------------------------
-- 4. CLAIM ATÔMICO
--
--    Nenhuma chamada externa acontece antes disto. A função move as linhas
--    queued/failed para 'sending' dentro de uma única transação, usando
--    FOR UPDATE SKIP LOCKED: se dois workers rodarem ao mesmo tempo, cada
--    linha sai para exatamente um deles. O provedor nunca recebe a mesma
--    mensagem duas vezes por corrida entre processos.
--
--    Só service_role executa — é chamada pelo servidor, nunca pelo app.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_sos_notifications(
  _sos_event_id uuid,
  _claim_token  uuid,
  _only_failed  boolean DEFAULT false,
  _max          integer DEFAULT 20,
  _stale_after  interval DEFAULT interval '2 minutes'
)
RETURNS TABLE (
  id              uuid,
  recipient_name  text,
  recipient_phone text,
  attempts        integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _claim_token IS NULL THEN
    RAISE EXCEPTION 'claim_token e obrigatorio.';
  END IF;

  -- Devolve à fila o que ficou preso em 'sending' (processo morto, deploy no
  -- meio do envio). Sem isto, uma linha travada nunca mais seria tentada.
  UPDATE public.whatsapp_notifications
     SET status = 'failed',
         error_message = COALESCE(error_message, 'Envio interrompido antes de concluir.'),
         claim_token = NULL,
         claimed_at = NULL
   WHERE sos_event_id = _sos_event_id
     AND status = 'sending'
     AND claimed_at IS NOT NULL
     AND claimed_at < now() - _stale_after;

  RETURN QUERY
  WITH alvo AS (
    SELECT w.id
      FROM public.whatsapp_notifications w
     WHERE w.sos_event_id = _sos_event_id
       AND w.status = ANY (CASE WHEN _only_failed THEN ARRAY['failed'] ELSE ARRAY['queued','failed'] END)
     ORDER BY w.created_at
     LIMIT GREATEST(_max, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_notifications w
     SET status = 'sending',
         claim_token = _claim_token,
         claimed_at = now(),
         attempts = w.attempts + 1
    FROM alvo
   WHERE w.id = alvo.id
  RETURNING w.id, w.recipient_name, w.recipient_phone, w.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sos_notifications(uuid, uuid, boolean, integer, interval) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sos_notifications(uuid, uuid, boolean, integer, interval) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Fechamento do claim — só quem tem o token pode fechar a linha que pegou.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_sos_notification(
  _id                  uuid,
  _claim_token         uuid,
  _ok                  boolean,
  _provider_message_id text DEFAULT NULL,
  _error               text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE public.whatsapp_notifications
     SET status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END,
         provider_message_id = COALESCE(_provider_message_id, provider_message_id),
         error_message = CASE WHEN _ok THEN NULL ELSE left(COALESCE(_error,'Falha no envio.'), 500) END,
         sent_at = CASE WHEN _ok THEN now() ELSE sent_at END,
         claim_token = NULL,
         claimed_at = NULL
   WHERE id = _id
     AND claim_token = _claim_token
     AND status = 'sending';

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_sos_notification(uuid, uuid, boolean, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sos_notification(uuid, uuid, boolean, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. ENTREGA — única porta de entrada para 'delivered'
--
--    Esta função existe para deixar explícito no banco o que o app promete na
--    tela: a palavra "entregue" só aparece depois que o WEBHOOK de status do
--    provedor confirmou. Ninguém mais grava esse status: nem o app, nem a
--    rotina de envio, nem o usuário.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_sos_notification_delivered(
  _provider_message_id text,
  _status              text DEFAULT 'delivered',
  _occurred_at         timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF _status NOT IN ('delivered','read') THEN
    RAISE EXCEPTION 'Somente delivered ou read podem ser confirmados por webhook.';
  END IF;
  IF _provider_message_id IS NULL OR length(btrim(_provider_message_id)) = 0 THEN
    RAISE EXCEPTION 'provider_message_id e obrigatorio para confirmar entrega.';
  END IF;

  UPDATE public.whatsapp_notifications
     SET status = _status,
         delivered_at = COALESCE(delivered_at, _occurred_at)
   WHERE provider_message_id = _provider_message_id
     AND status IN ('sent','delivered');

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sos_notification_delivered(text, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sos_notification_delivered(text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.claim_sos_notifications(uuid, uuid, boolean, integer, interval) IS
  'Claim atomico (FOR UPDATE SKIP LOCKED) das linhas queued/failed. Obrigatorio antes de qualquer chamada externa.';
COMMENT ON FUNCTION public.mark_sos_notification_delivered(text, text, timestamptz) IS
  'Unica porta para status delivered/read. Chamada apenas pelo webhook de status do provedor.';
COMMENT ON INDEX public.ux_wn_evento_telefone IS
  'Impede duas notificacoes para o mesmo numero dentro do mesmo SOS.';