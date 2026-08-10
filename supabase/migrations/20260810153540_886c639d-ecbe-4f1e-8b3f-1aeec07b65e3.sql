-- ============================================================================
-- CHECKPOINT 1B — parte 1 de 2: sos_events vira SOMENTE LEITURA para o app
--
-- Migration ADITIVA. Não edita nenhuma das migrations anteriores.
--
-- Motivo: até aqui o cliente Supabase podia inserir, alterar e apagar linhas
-- de sos_events direto do navegador. Isso deixava passar por fora TODAS as
-- garantias do Checkpoint 1: um INSERT direto ignorava o request_id, o índice
-- de "um SOS ativo por usuário" só barrava o segundo, e um UPDATE direto podia
-- mudar status, coordenada e carimbos sem passar por regra nenhuma.
--
-- A partir daqui:
--   authenticated  -> SELECT dos próprios eventos, e nada além disso
--   ciclo de vida  -> exclusivamente por sos_open / sos_cancel / sos_resolve
--   service_role   -> intocado, continua com acesso total
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Derruba as policies de escrita
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sos_insert_own" ON public.sos_events;
DROP POLICY IF EXISTS "sos_update_own" ON public.sos_events;
DROP POLICY IF EXISTS "sos_delete_own" ON public.sos_events;

-- ----------------------------------------------------------------------------
-- 2. Derruba os GRANTs de escrita
--
--    Só a policy não bastaria: sem GRANT o PostgREST recusa antes mesmo de
--    avaliar RLS, e sem RLS um GRANT sobrando reabriria o caminho.
--    As duas travas são necessárias.
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.sos_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sos_events FROM anon;

-- Leitura dos próprios eventos continua (a policy sos_select_own segue de pé).
GRANT SELECT ON public.sos_events TO authenticated;

-- O servidor não é afetado por nada acima.
GRANT ALL ON public.sos_events TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Confere que a policy de leitura sobreviveu
--    (recriada apenas se alguém a tiver removido em algum ponto)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sos_events' AND policyname = 'sos_select_own'
  ) THEN
    CREATE POLICY "sos_select_own" ON public.sos_events
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Apagar o próprio histórico continua possível — por RPC, não por DELETE
--
--    A tela de Histórico tem um botão "Limpar histórico". Sem DELETE direto
--    ele deixaria de funcionar em silêncio, e o direito de apagar os próprios
--    dados é legítimo. A RPC preserva a função e mantém a trava: um SOS ainda
--    ATIVO nunca é apagado, porque apagá-lo seria sumir com uma emergência em
--    curso em vez de encerrá-la.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sos_purge_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_apagados integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.sos_events
   WHERE user_id = v_uid
     AND status <> 'active';

  GET DIAGNOSTICS v_apagados = ROW_COUNT;
  RETURN v_apagados;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_purge_history() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_purge_history() TO authenticated, service_role;

COMMENT ON FUNCTION public.sos_purge_history() IS
  'Apaga o historico de SOS do proprio usuario. Nunca apaga um evento ainda active.';
COMMENT ON TABLE public.sos_events IS
  'SOMENTE LEITURA para authenticated. Abertura, cancelamento e resolucao passam por sos_open / sos_cancel / sos_resolve.';