-- ============================================================================
-- CHECKPOINT 1B — parte 2 de 2: sos_open endurecido
--
-- Migration ADITIVA. Substitui apenas o CORPO da função via CREATE OR REPLACE
-- (mesma assinatura e mesmo tipo de retorno da migration 20260806120000).
--
-- Por que endurecer: com sos_events agora somente-leitura, sos_open virou a
-- ÚNICA porta de abertura — e ela é chamável direto pelo cliente Supabase.
-- Toda regra que antes morava só no TypeScript precisa existir aqui também,
-- porque o cliente pode ser adulterado e a RPC pode ser chamada por curl.
--
-- Duas coisas ficam garantidas por transação:
--   (a) duas chamadas simultâneas, mesmo com request_id DIFERENTES, produzem
--       UM único evento; ambas recebem o mesmo evento; uma volta reused=true;
--       nenhuma recebe erro de índice único.
--   (b) um request_id de evento já encerrado NÃO ressuscita o evento.
-- ============================================================================

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
  -- ------------------------------------------------------------------
  -- 1. Autenticação
  -- ------------------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Validação de entrada — as mesmas regras do cliente, reaplicadas
  --    aqui porque o cliente não é confiável.
  -- ------------------------------------------------------------------
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: request_id e obrigatorio.'
      USING ERRCODE = '22023';
  END IF;

  -- BETWEEN ja recusa NaN e Infinity: em Postgres, NaN e Infinity sao
  -- ordenados acima de qualquer numero finito, entao o teste falha.
  IF _lat IS NULL OR _lng IS NULL
     OR NOT (_lat BETWEEN -90 AND 90)
     OR NOT (_lng BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'SOS_ENTRADA_INVALIDA: coordenada fora de faixa.'
      USING ERRCODE = '22023';
  END IF;

  -- Null Island: o (0,0) e o zero devolvido por GPS quebrado, nao um lugar.
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

  -- ------------------------------------------------------------------
  -- 3. SERIALIZAÇÃO POR USUÁRIO
  --
  --    Trava de transação com chave derivada do uid. Duas chamadas
  --    simultâneas do MESMO usuário entram em fila aqui; a segunda só
  --    prossegue depois que a primeira terminou, e portanto já enxerga o
  --    evento que a primeira criou. É isto que faz dois toques com
  --    request_id diferentes resultarem em um evento só.
  --
  --    Usuários diferentes têm chaves diferentes e não se bloqueiam.
  --    O lock cai sozinho no fim da transação — não há como vazar.
  -- ------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 20260806));

  -- ------------------------------------------------------------------
  -- 4. Este request_id já foi usado?
  -- ------------------------------------------------------------------
  SELECT * INTO v_event
    FROM public.sos_events
   WHERE request_id = _request_id AND user_id = v_uid;

  IF FOUND THEN
    -- Reaproveita SOMENTE se o evento ainda estiver aberto. Um acionamento
    -- já cancelado ou resolvido não pode voltar à tela como se estivesse em
    -- curso: a pessoa acharia que tem socorro a caminho quando não tem.
    IF v_event.status <> 'active' THEN
      RAISE EXCEPTION
        'SOS_ENCERRADO: este acionamento ja foi encerrado (status %). Gere um novo request_id.',
        v_event.status
        USING ERRCODE = '22023';
    END IF;
    v_reused := true;

  ELSE
    -- ----------------------------------------------------------------
    -- 5. Já existe outro SOS aberto? Devolve ele em vez de abrir o segundo.
    -- ----------------------------------------------------------------
    SELECT * INTO v_event
      FROM public.sos_events
     WHERE user_id = v_uid AND status = 'active'
     ORDER BY triggered_at DESC
     LIMIT 1;

    IF FOUND THEN
      v_reused := true;
    ELSE
      -- --------------------------------------------------------------
      -- 6. Caminho normal: abre o evento.
      --
      --    O advisory lock acima já deveria tornar a colisão impossível
      --    dentro deste banco. O bloco de exceção é a segunda trava, para
      --    o caso de uma corrida vinda por outro caminho: em vez de
      --    devolver erro de índice único ao aparelho de alguém em
      --    emergência, relê o vencedor e devolve o mesmo evento.
      -- --------------------------------------------------------------
      BEGIN
        INSERT INTO public.sos_events
          (user_id, request_id, latitude, longitude, accuracy_m, fix_age_ms, note, status)
        VALUES
          (v_uid, _request_id, _lat, _lng, _accuracy_m, _fix_age_ms, _note, 'active')
        RETURNING * INTO v_event;

      EXCEPTION
        WHEN unique_violation THEN
          v_reused := true;
          SELECT * INTO v_event
            FROM public.sos_events
           WHERE user_id = v_uid AND status = 'active'
           ORDER BY triggered_at DESC
           LIMIT 1;

          IF NOT FOUND THEN
            SELECT * INTO v_event
              FROM public.sos_events
             WHERE request_id = _request_id AND user_id = v_uid;
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

  -- ------------------------------------------------------------------
  -- 7. Enfileira os contatos. ON CONFLICT cobre a reentrada: o mesmo
  --    contato nunca entra duas vezes na fila do mesmo evento.
  -- ------------------------------------------------------------------
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

COMMENT ON FUNCTION public.sos_open(uuid, double precision, double precision, double precision, integer, text) IS
  'Unica porta de abertura de SOS. Valida entrada, serializa por usuario com advisory lock e trata unique_violation. Recusa request_id de evento ja encerrado.';