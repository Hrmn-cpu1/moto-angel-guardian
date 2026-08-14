-- ============================================================================
-- CHECKPOINT RC2-B — SOS COMUNITÁRIO
--
-- Migration ADITIVA. Não reescreve nenhuma migration aplicada e NÃO TOCA no
-- corpo de sos_open, sos_cancel e sos_resolve — as três funções validadas no
-- Samsung continuam exatamente como estão (P0.2, 20260811090000).
--
-- DECISÃO DE ARQUITETURA
-- ----------------------
-- O requisito diz: a sincronização tem que ser garantida pelo backend, não por
-- "o frontend chama sos_open e depois insere um alerta". Havia dois caminhos:
--
--   (a) reescrever as três RPCs para inserir/atualizar o alerta; ou
--   (b) um TRIGGER em sos_events.
--
-- Escolhi (b). Motivos:
--   1. não mexe em código já validado fisicamente — risco zero de regressão
--      no SOS manual;
--   2. cobre TODO caminho que altere sos_events, inclusive service_role,
--      rotina administrativa ou correção manual — não só as três RPCs;
--   3. a idempotência fica no índice único, não na lógica.
--
-- GARANTIAS
-- ---------
--   . um sos_event_id  ->  no máximo UM alerta comunitário (índice único
--     parcial ux_community_alerts_sos_event);
--   . retry do mesmo request_id -> sos_open devolve o MESMO evento -> nenhum
--     INSERT novo acontece, porque não há evento novo;
--   . corrida -> ON CONFLICT DO NOTHING sobre o índice único;
--   . sos_cancel  -> alerta vira 'cancelled';
--   . sos_resolve -> alerta vira 'resolved';
--   . qualquer outro status final -> alerta vira 'expired'.
--     Nenhum "SOS fantasma" sobra no mapa.
--
-- PRIVACIDADE (corrigida antes da primeira aplicação — hotfix P0.4-A)
-- ------------------------------------------------------------------
-- O alerta de SOS carrega apenas posição, horário e o vínculo com o evento.
-- Telefone, e-mail e nome completo NUNCA entram: nearby_alerts passa a expor
-- somente o primeiro nome, para SOS e para todos os outros tipos.
--
-- Mas isso não bastava. A migration original de community_alerts criou:
--
--     CREATE POLICY "alerts readable by authenticated"
--       ON public.community_alerts FOR SELECT TO authenticated USING (true);
--
-- Com o espelho do SOS na mesma tabela, qualquer usuário autenticado poderia
-- pular a RPC e fazer `select * from community_alerts` para colher a posição
-- exata de todo mundo que acionou o SOS. A porta segura não serve de nada
-- enquanto a janela ao lado está aberta.
--
-- A policy de SELECT passa a distinguir as duas coisas:
--   . alerta manual (sos_event_id IS NULL) -> legível por authenticated,
--     exatamente como antes;
--   . espelho de SOS (sos_event_id IS NOT NULL) -> legível apenas pelo dono.
--
-- Terceiros só alcançam SOS pela RPC nearby_alerts(), que é SECURITY DEFINER
-- (não passa por RLS), filtra por raio e janela de tempo e devolve só o
-- primeiro nome.
--
-- CONSEQUÊNCIA NO REALTIME, ASSUMIDA DE PROPÓSITO
-- -----------------------------------------------
-- O Realtime do Supabase respeita RLS. Fechado o SELECT, o evento de um SOS
-- de terceiro deixa de chegar por postgres_changes — e não vamos reabrir o
-- SELECT para consertar isso: seria trocar privacidade por conveniência de
-- UI. O cliente passa a reconsultar nearby_alerts periodicamente enquanto o
-- app está em uso (ver useAlerts).
--
-- ROLLBACK CONCEITUAL
-- -------------------
--   drop trigger trg_sos_sync_community_alert on public.sos_events;
--   drop function public.sos_sync_community_alert();
-- As colunas e o índice podem ficar: são inertes sem o trigger.
-- ============================================================================

-- ############################################################################
-- ORDEM DESTA MIGRATION (reordenada antes da primeira aplicação — regra 3)
--
-- A PARTE 1 endurece o modelo de localização. A PARTE 2 liga o SOS
-- comunitário. Nesta ordem, e não na inversa, porque a PARTE 2 é o que
-- publica latitude e longitude de terceiros.
--
-- Se esta migration parar no meio, o pior estado possível passa a ser
-- "localização endurecida e SOS comunitário ainda desligado" — seguro.
-- Na ordem anterior o pior estado era "SOS comunitário no ar com
-- live_locations ainda aberta para escrita direta", que é justamente a
-- combinação que os hotfixes P0.5 e P0.6 existiram para impedir.
--
--   PARTE 1  sharing DEFAULT false, escrita direta fechada, policy
--            own-select, presence_touch, set_location_sharing, rate limit,
--            anti-teleporte, retenção
--   PARTE 2  colunas de community_alerts, RLS, trigger, backfill,
--            nearby_alerts
--
-- A migration 30 (riders) depende desta e não repete nada dela.
-- ############################################################################

-- ####################### PARTE 1 — LOCALIZAÇÃO ##############################

-- ============================================================================
-- HOTFIX P0.5-A (pré-primeira-aplicação) — a origem de proximidade não pode
-- ser inventada pelo cliente.
--
-- PROBLEMA
-- --------
-- `nearby_alerts` e `online_riders` são SECURITY DEFINER e recebiam o centro
-- por parâmetro. Limitar cada chamada a 50 km não impede nada: bastava
-- chamar em laço com São Paulo, Rio, Curitiba... e varrer o país atrás de
-- SOS ativos e de motociclistas. "Próximo" precisa significar próximo da
-- posição REAL do viewer, não de qualquer coordenada que ele digite.
--
-- SOLUÇÃO
-- -------
-- O servidor passa a decidir o centro. `_lat`/`_lng` continuam na assinatura
-- (o frontend não muda) mas NÃO são mais usados como origem para descobrir
-- terceiros: a origem é a posição recente do próprio auth.uid() gravada em
-- live_locations. Não há o que falsificar — a linha é protegida por RLS e só
-- o dono escreve nela.
--
-- Sem posição recente registrada, a descoberta de terceiros simplesmente não
-- acontece (lista vazia). É a mesma regra que já vale para quem aparece:
-- quem não publica posição não participa da camada de proximidade.
--
-- PRIVACIDADE — o ponto delicado desta correção
-- ---------------------------------------------
-- Para autorizar proximidade o servidor precisa saber onde o viewer está.
-- Isso NÃO pode virar publicação: ver alerta próximo não é consentir em
-- aparecer para os outros. Por isso `presence_touch` preserva `sharing` como
-- está e cria a primeira linha com `sharing = false`. Ninguém passa a
-- aparecer por ter aberto a tela de alertas.
-- O DEFAULT da coluna também vira false, como segunda trava: uma inserção
-- futura que esqueça a coluna não publica ninguém por omissão.
-- ============================================================================

ALTER TABLE public.live_locations ALTER COLUMN sharing SET DEFAULT false;

COMMENT ON COLUMN public.live_locations.sharing IS
  'Publicacao da posicao para outros. Default false: presenca registrada para autorizar proximidade NAO e publicacao. So o proprio usuario liga isto, de forma explicita.';

-- ----------------------------------------------------------------------------
-- HOTFIX P0.6 — o que a v4 afirmava e estava ERRADO
--
-- A v4 dizia "a linha é protegida por RLS, então não há o que falsificar".
-- Falso. A policy `USING (auth.uid() = user_id)` garante que a pessoa só
-- escreve NA PRÓPRIA linha; não garante que os VALORES daquela linha sejam
-- verdadeiros. Com `GRANT INSERT, UPDATE, DELETE ... TO authenticated`,
-- qualquer conta podia editar lat/lng/updated_at direto e depois chamar as
-- RPCs — a origem continuava sendo escolhida pelo cliente.
--
-- O QUE ISTO AQUI FAZ, E O QUE NÃO FAZ
-- ------------------------------------
-- FAZ: tira a escrita direta da tabela, concentra toda escrita em duas RPCs
--      estreitas, impõe intervalo mínimo entre atualizações e recusa
--      deslocamento fisicamente implausível. Isso encarece e limita a
--      varredura geográfica por uma conta.
-- NÃO FAZ: provar que o telefone está mesmo naquela coordenada. GPS é dado
--      originado no dispositivo. Sem attestation de plataforma, nenhum
--      servidor tem essa prova — e a primeira posição de uma conta continua
--      vindo do cliente, sem verificação possível.
-- ----------------------------------------------------------------------------

-- 1) Escrita direta: fechada. Leitura da própria linha continua permitida
--    (a policy já restringe a auth.uid() = user_id).
REVOKE INSERT, UPDATE, DELETE ON public.live_locations FROM authenticated;

DROP POLICY IF EXISTS "live location own access" ON public.live_locations;
DROP POLICY IF EXISTS "live location own select" ON public.live_locations;
CREATE POLICY "live location own select" ON public.live_locations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.live_locations IS
  'Presenca e posicao. Escrita somente por presence_touch (posicao) e set_location_sharing (publicacao). authenticated nao tem INSERT/UPDATE/DELETE direto; service_role continua com acesso total.';

-- ----------------------------------------------------------------------------
-- 2) Presença do viewer: registra onde ele está sem mexer no que ele publica.
--
--    Controles de servidor (P0.6-B):
--      . intervalo mínimo de 5 s entre atualizações — chamada mais rápida é
--        ignorada em silêncio, devolvendo 'throttled'. O throttle de 20 s do
--        React é UX; este é o que vale contra chamada REST direta;
--      . deslocamento implausível recusado: acima de 400 km/h implícita, a
--        atualização não acontece e a função devolve 'rejected_jump'.
--
--    Por que 400 km/h e não 120: o limite não é sobre velocidade real de
--    moto, é sobre teleporte entre cidades. Precisa ser folgado o bastante
--    para absorver GPS ruim, salto de torre, túnel e trecho de rodovia com
--    fix impreciso. 400 km/h nunca acusa um motoboy e derruba São Paulo →
--    Rio em segundos, que é o abuso que interessa barrar.
--
--    A checagem só vale quando a posição anterior tem menos de 30 minutos.
--    Acima disso o app estava fechado e a pessoa pode ter viajado de avião,
--    ônibus ou carona — recusar seria quebrar uso legítimo. A janela de
--    varredura que queremos matar acontece em segundos, não em horas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.presence_touch(
  _lat       double precision,
  _lng       double precision,
  _speed_kmh double precision DEFAULT NULL,
  _heading   double precision DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_ant          public.live_locations%ROWTYPE;
  v_segundos     double precision;
  v_dist_km      double precision;
  v_kmh          double precision;
  INTERVALO_MIN  constant double precision := 5;    -- segundos
  VEL_MAX_KMH    constant double precision := 400;  -- teleporte, não velocidade
  JANELA_MIN     constant double precision := 30;   -- minutos
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _lat IS NULL OR _lng IS NULL
     OR NOT (_lat BETWEEN -90 AND 90)
     OR NOT (_lng BETWEEN -180 AND 180)
     OR (_lat = 0 AND _lng = 0) THEN
    RAISE EXCEPTION 'PRESENCA_INVALIDA: coordenada fora de faixa.' USING ERRCODE = '22023';
  END IF;

  SELECT ll.* INTO v_ant
    FROM public.live_locations ll
   WHERE ll.user_id = v_uid
   FOR UPDATE;

  IF FOUND THEN
    v_segundos := EXTRACT(EPOCH FROM (now() - v_ant.updated_at));

    -- Frequência: chamada rápida demais não atualiza nada.
    IF v_segundos < INTERVALO_MIN THEN
      RETURN 'throttled';
    END IF;

    -- Plausibilidade: só dentro da janela em que faz sentido comparar.
    IF v_segundos <= JANELA_MIN * 60 THEN
      v_dist_km := 6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(v_ant.lat)) * cos(radians(_lat)) * cos(radians(_lng) - radians(v_ant.lng))
        + sin(radians(v_ant.lat)) * sin(radians(_lat))
      )));
      -- Menos de 1 km é ruído de GPS: nunca acusa.
      IF v_dist_km > 1 THEN
        v_kmh := v_dist_km / (v_segundos / 3600.0);
        IF v_kmh > VEL_MAX_KMH THEN
          RETURN 'rejected_jump';
        END IF;
      END IF;
    END IF;

    UPDATE public.live_locations ll
       SET lat = _lat,
           lng = _lng,
           speed_kmh = NULLIF(GREATEST(COALESCE(_speed_kmh, 0), 0), 0),
           heading = _heading,
           -- sharing NÃO entra no SET: atualizar posição jamais muda a
           -- escolha de compartilhamento, em nenhuma direção.
           updated_at = now()
     WHERE ll.user_id = v_uid;

    RETURN 'ok';
  END IF;

  -- Primeira linha da conta. LIMITAÇÃO ASSUMIDA: esta coordenada vem do
  -- cliente e não há como verificá-la. O controle de plausibilidade só passa
  -- a valer a partir da segunda posição.
  INSERT INTO public.live_locations (user_id, lat, lng, speed_kmh, heading, sharing, updated_at)
  VALUES (v_uid, _lat, _lng,
          NULLIF(GREATEST(COALESCE(_speed_kmh, 0), 0), 0),
          _heading,
          false,              -- primeira linha NUNCA nasce publicada
          now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.presence_touch(double precision, double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_touch(double precision, double precision, double precision, double precision) TO authenticated;

COMMENT ON FUNCTION public.presence_touch(double precision, double precision, double precision, double precision) IS
  'Unico caminho para atualizar a posicao propria. Preserva sharing; primeira linha nasce privada; intervalo minimo de 5 s e recusa de deslocamento acima de 400 km/h dentro de 30 min. Reduz varredura; nao prova onde o aparelho esta.';

-- ----------------------------------------------------------------------------
-- 3) Publicação: RPC própria, separada da posição.
--    Muda SOMENTE sharing. Não aceita user_id, não aceita coordenada, não
--    inventa posição e não apaga a que existe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_location_sharing(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL THEN
    RAISE EXCEPTION 'SHARING_INVALIDO: informe true ou false.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.live_locations ll
     SET sharing = _enabled
   WHERE ll.user_id = v_uid;

  IF NOT FOUND THEN
    -- Ainda não há linha: cria uma sem posição real. Coordenada NULL não é
    -- aceita pelo esquema, então marcamos com updated_at antigo — assim ela
    -- nunca conta como "presença recente" para nenhuma consulta de
    -- proximidade até a primeira posição verdadeira chegar.
    INSERT INTO public.live_locations (user_id, lat, lng, sharing, updated_at)
    VALUES (v_uid, 0, 0, _enabled, now() - interval '10 years')
    ON CONFLICT (user_id) DO UPDATE SET sharing = EXCLUDED.sharing;
  END IF;

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_sharing(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_location_sharing(boolean) TO authenticated;

COMMENT ON FUNCTION public.set_location_sharing(boolean) IS
  'Liga/desliga a publicacao da propria posicao. Nao aceita user_id nem coordenada; nao altera lat/lng existentes.';

-- ----------------------------------------------------------------------------
-- 4) Retenção e minimização.
--
--    Duas coisas diferentes vivem na mesma linha: a PREFERÊNCIA (sharing) e a
--    POSIÇÃO OPERACIONAL (lat/lng/updated_at). Uma coordenada que já venceu o
--    TTL operacional não serve mais para nada — mas antes ela ficava guardada
--    para sempre quando `sharing = true`, como se o booleano justificasse
--    manter o dado. Não justifica: a preferência se guarda com um booleano,
--    não com uma coordenada velha.
--
--    Regra:
--      . sharing = false e parado há N dias  -> linha apagada;
--      . sharing = true  e parado há N dias  -> coordenada descartada
--        (0,0 = Null Island, que TODAS as RPCs já recusam como origem e como
--        posição), preferência preservada. A pessoa continua com o
--        compartilhamento ligado; só não há mais onde ela esteve.
--
--    Agendar continua sendo passo de operação, e está documentado como
--    pendência em RC2-MIGRATIONS-FINAL.md.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_stale_presence(_days integer DEFAULT 30)
RETURNS TABLE (apagadas integer, anonimizadas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apagadas     integer;
  v_anonimizadas integer;
  v_corte        timestamptz := now() - (GREATEST(COALESCE(_days, 30), 1) || ' days')::interval;
BEGIN
  -- Presença privada vencida: some inteira. Não há preferência a preservar,
  -- porque `false` já é o padrão da coluna.
  DELETE FROM public.live_locations ll
   WHERE ll.sharing = false
     AND ll.updated_at < v_corte;
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  -- Com sharing ligado, a linha guarda DUAS coisas: uma preferência (o
  -- booleano) e uma coordenada. A preferência é do usuário e fica; a
  -- coordenada já venceu o TTL operacional (15-30 min) há semanas e não serve
  -- mais para nada — só representa risco. Zerar para 0,0 é o descarte: todas
  -- as RPCs recusam Null Island, então a linha nunca mais aparece em consulta
  -- de proximidade até chegar uma posição nova de verdade.
  UPDATE public.live_locations ll
     SET lat = 0,
         lng = 0,
         speed_kmh = NULL,
         heading = NULL
   WHERE ll.sharing = true
     AND ll.updated_at < v_corte
     AND NOT (ll.lat = 0 AND ll.lng = 0);
  GET DIAGNOSTICS v_anonimizadas = ROW_COUNT;

  RETURN QUERY SELECT v_apagadas, v_anonimizadas;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_presence(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_stale_presence(integer) TO service_role;

COMMENT ON FUNCTION public.purge_stale_presence(integer) IS
  'Retencao de presenca. Apaga linhas privadas paradas ha N dias e descarta a coordenada (mantendo a preferencia) das linhas com sharing ligado. So service_role executa. Devolve o total de linhas afetadas.';

-- ####################### PARTE 2 — SOS COMUNITÁRIO #########################

-- ----------------------------------------------------------------------------
-- 1. Colunas de vínculo e de ciclo de vida
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_alerts
  ADD COLUMN IF NOT EXISTS sos_event_id uuid REFERENCES public.sos_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz;

COMMENT ON COLUMN public.community_alerts.sos_event_id IS
  'Preenchido somente por trigger a partir de sos_events. Alerta com este campo nao nulo e espelho de um SOS e nao pode ser criado nem editado pelo cliente.';

-- ----------------------------------------------------------------------------
-- 2. Vocabulário fechado de status
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_community_alerts_status') THEN
    ALTER TABLE public.community_alerts
      ADD CONSTRAINT ck_community_alerts_status
      CHECK (status IN ('active','cancelled','resolved','expired'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. O tipo 'sos' passa a ser aceito, sem perder os quatro existentes.
--    O CHECK original foi criado inline e ganhou nome automático, por isso a
--    troca é feita procurando a restrição pela definição, não pelo nome.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.community_alerts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%perigo%'
       AND conname <> 'ck_community_alerts_type'
  LOOP
    EXECUTE format('ALTER TABLE public.community_alerts DROP CONSTRAINT %I', c.conname);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_community_alerts_type') THEN
    ALTER TABLE public.community_alerts
      ADD CONSTRAINT ck_community_alerts_type
      CHECK (type IN ('perigo','acidente','bloqueio','roubo','sos'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Idempotência garantida pelo banco: um evento, um alerta.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_community_alerts_sos_event
  ON public.community_alerts (sos_event_id)
  WHERE sos_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_alerts_status_created
  ON public.community_alerts (status, created_at DESC);

COMMENT ON INDEX public.ux_community_alerts_sos_event IS
  'Um sos_event_id corresponde a no maximo um alerta comunitario. E aqui que a idempotencia vive.';

-- ----------------------------------------------------------------------------
-- 5. RLS: alerta de SOS não é criado nem editado pelo cliente.
--    As policies antigas permitiam ao dono inserir qualquer tipo e apagar o
--    próprio alerta — o que deixaria um SOS ativo sumir do mapa por fora do
--    fluxo. As novas mantêm exatamente o que já era permitido para os quatro
--    tipos manuais e fecham só o espelho do SOS.
-- ----------------------------------------------------------------------------
-- SELECT: alerta manual continua público entre autenticados; espelho de SOS
-- só para o dono. Terceiros passam obrigatoriamente por nearby_alerts().
DROP POLICY IF EXISTS "alerts readable by authenticated" ON public.community_alerts;
DROP POLICY IF EXISTS "alerts select scoped" ON public.community_alerts;
CREATE POLICY "alerts select scoped" ON public.community_alerts
  FOR SELECT TO authenticated
  USING (sos_event_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "alerts insert own" ON public.community_alerts;
CREATE POLICY "alerts insert own" ON public.community_alerts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND type <> 'sos' AND sos_event_id IS NULL);

DROP POLICY IF EXISTS "alerts update own" ON public.community_alerts;
CREATE POLICY "alerts update own" ON public.community_alerts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND sos_event_id IS NULL)
  WITH CHECK (auth.uid() = user_id AND sos_event_id IS NULL AND type <> 'sos');

DROP POLICY IF EXISTS "alerts delete own" ON public.community_alerts;
CREATE POLICY "alerts delete own" ON public.community_alerts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND sos_event_id IS NULL);

-- ----------------------------------------------------------------------------
-- 6. O espelho: trigger em sos_events.
--
--    Referências de coluna qualificadas por alias, pela mesma razão do P0.2.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sos_sync_community_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      INSERT INTO public.community_alerts
        (user_id, type, title, description, lat, lng, sos_event_id, status)
      VALUES
        (NEW.user_id, 'sos', 'SOS ativo', 'Motociclista precisa de ajuda',
         NEW.latitude::double precision, NEW.longitude::double precision, NEW.id, 'active')
      ON CONFLICT (sos_event_id) WHERE sos_event_id IS NOT NULL DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' THEN
      -- Caminho raro (reabertura administrativa): garante o espelho sem
      -- duplicar, apoiado no mesmo índice único.
      INSERT INTO public.community_alerts
        (user_id, type, title, description, lat, lng, sos_event_id, status)
      VALUES
        (NEW.user_id, 'sos', 'SOS ativo', 'Motociclista precisa de ajuda',
         NEW.latitude::double precision, NEW.longitude::double precision, NEW.id, 'active')
      ON CONFLICT (sos_event_id) WHERE sos_event_id IS NOT NULL DO NOTHING;

      UPDATE public.community_alerts ca
         SET status = 'active',
             resolved_at = NULL
       WHERE ca.sos_event_id = NEW.id;
    ELSE
      UPDATE public.community_alerts ca
         SET status = CASE
                        WHEN NEW.status = 'cancelled' THEN 'cancelled'
                        WHEN NEW.status IN ('resolved','notified') THEN 'resolved'
                        ELSE 'expired'
                      END,
             resolved_at = COALESCE(ca.resolved_at, now())
       WHERE ca.sos_event_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sos_sync_community_alert() IS
  'Espelha sos_events em community_alerts. Unica porta de criacao de alerta do tipo sos.';

DROP TRIGGER IF EXISTS trg_sos_sync_community_alert ON public.sos_events;
CREATE TRIGGER trg_sos_sync_community_alert
  AFTER INSERT OR UPDATE OF status ON public.sos_events
  FOR EACH ROW EXECUTE FUNCTION public.sos_sync_community_alert();

-- ----------------------------------------------------------------------------
-- 7. Eventos que já existiam ganham o espelho, e SOS já encerrado não
--    aparece como ativo. Sem isto, o mapa nasceria com histórico errado.
-- ----------------------------------------------------------------------------
INSERT INTO public.community_alerts
  (user_id, type, title, description, lat, lng, sos_event_id, status, created_at, resolved_at)
SELECT se.user_id, 'sos', 'SOS ativo', 'Motociclista precisa de ajuda',
       se.latitude::double precision, se.longitude::double precision, se.id,
       CASE
         WHEN se.status = 'active' THEN 'active'
         WHEN se.status = 'cancelled' THEN 'cancelled'
         WHEN se.status IN ('resolved','notified') THEN 'resolved'
         ELSE 'expired'
       END,
       se.triggered_at,
       CASE WHEN se.status = 'active' THEN NULL ELSE COALESCE(se.resolved_at, se.cancelled_at, se.updated_at) END
  FROM public.sos_events se
 WHERE se.latitude IS NOT NULL
   AND se.longitude IS NOT NULL
ON CONFLICT (sos_event_id) WHERE sos_event_id IS NOT NULL DO NOTHING;

-- ============================================================================
-- HOTFIX P0.5-A (pré-primeira-aplicação) — nearby_alerts também não pode
-- aceitar centro inventado.
--
-- Mesma falha e mesma correção de online_riders: o centro passa a ser a
-- posição recente do próprio auth.uid() em live_locations, registrada por
-- public.presence_touch (criada na migration RC2-C, que roda logo em seguida;
-- não há dependência de DDL entre as duas, apenas de uso em execução). `_lat`/`_lng`
-- continuam na assinatura — o frontend não muda — mas deixam de decidir a
-- origem, então não há como varrer o país atrás de SOS ativos.
--
-- Sem posição recente do viewer, a lista sai vazia: não é possível descobrir
-- quem está "perto" de alguém que não disse onde está.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.nearby_alerts(
  _lat        double precision,
  _lng        double precision,
  _radius_km  double precision DEFAULT 25,
  _hours      integer DEFAULT 12
)
RETURNS TABLE (
  id          uuid,
  type        text,
  title       text,
  description text,
  address     text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz,
  author_name text,
  distance_km double precision,
  is_mine     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eu AS (
    SELECT me.lat, me.lng
      FROM public.live_locations me
     WHERE me.user_id = auth.uid()
       AND me.updated_at > now() - interval '30 minutes'
       AND me.lat BETWEEN -90 AND 90
       AND me.lng BETWEEN -180 AND 180
       AND NOT (me.lat = 0 AND me.lng = 0)
  ),
  lim AS (
    SELECT
      LEAST(GREATEST(COALESCE(_radius_km, 25), 1), 50)::double precision AS radius_km,
      LEAST(GREATEST(COALESCE(_hours, 12), 1), 24)::integer              AS horas
  )
  SELECT a.id, a.type, a.title, a.description, a.address, a.lat, a.lng, a.created_at,
    COALESCE(NULLIF(split_part(COALESCE(p.name,''), ' ', 1), ''), 'Motociclista') AS author_name,
    (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(a.lat))
    )))) AS distance_km,
    (a.user_id = auth.uid()) AS is_mine
  FROM public.community_alerts a
  CROSS JOIN eu
  CROSS JOIN lim
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND a.status = 'active'
    AND a.created_at > now() - (lim.horas || ' hours')::interval
    AND (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(a.lat))
    )))) <= lim.radius_km
  ORDER BY (a.type = 'sos') DESC, a.created_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.nearby_alerts(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nearby_alerts(double precision, double precision, double precision, integer) TO authenticated;

COMMENT ON FUNCTION public.nearby_alerts(double precision, double precision, double precision, integer) IS
  'Alertas proximos. Origem = presenca recente da propria conta, nao os parametros do cliente; reduz varredura geografica. GPS continua sendo dado originado no dispositivo. Sem presenca recente, devolve vazio.';