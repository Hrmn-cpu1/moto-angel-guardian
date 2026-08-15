-- ============================================================================
-- CHECKPOINT RC5 — HEATMAP: FIM DA DUPLA CONTAGEM DO SOS
--
-- MOTIVO (cadeia causal provada, não suspeita)
-- -------------------------------------------
-- `risk_heatmap` (migration 20260803214632) soma DOIS conjuntos:
--
--     community_alerts  ->  peso 3 (roubo/acidente) ou 2 (demais)
--     sos_events        ->  peso 4
--
-- Ela foi escrita quando `community_alerts` continha SOMENTE alertas manuais.
-- A migration RC2-B criou o trigger `trg_sos_sync_community_alert`, que passou
-- a inserir uma linha `type = 'sos'` em community_alerts para CADA sos_event —
-- inclusive um backfill de todo o histórico.
--
-- Resultado a partir da aplicação da RC2-B: todo SOS entra duas vezes.
--   . uma vez pelo ramo sos_events        -> peso 4
--   . uma vez pelo espelho em community_alerts, que cai no ELSE do CASE
--     (porque 'sos' não está em ('roubo','acidente'))  -> peso 2
--   Total 6, quando o valor previsto pela função era 4.
--
-- Não é um erro de arredondamento: são 50% a mais de peso em cima justamente
-- do ponto mais grave do mapa. E como a intensidade visual é normalizada pelo
-- maior peso da lista, a distorção não fica só no ponto do SOS — ela achata
-- todos os outros riscos em volta.
--
-- CORREÇÃO
-- --------
-- O ramo de community_alerts passa a ignorar o espelho (`sos_event_id IS NULL`).
-- `sos_events` continua sendo a fonte única do peso de SOS, com o peso 4 que a
-- função sempre quis dar. Nenhum dado é apagado: o espelho continua existindo,
-- continua alimentando o mapa comunitário e continua sendo o que a RLS protege.
--
-- IMPACTO
-- -------
--   . pontos de SOS voltam a pesar 4 em vez de 6;
--   . alertas manuais: nada muda;
--   . nenhuma linha é criada, alterada ou removida — a mudança é só de leitura;
--   . a assinatura da função não muda, então o frontend não muda.
--
-- RISCO
-- -----
-- Baixo. `CREATE OR REPLACE FUNCTION` de uma função STABLE de leitura. O pior
-- caso é o mapa mostrar manchas de SOS um pouco menos intensas do que ontem —
-- que é exatamente o objetivo.
--
-- DEPENDÊNCIAS
-- ------------
-- Exige a coluna `community_alerts.sos_event_id`, criada na RC2-B (aplicada).
--
-- ROLLBACK
-- --------
-- Reaplicar o corpo anterior (migration 20260803214632). Não há dado a
-- restaurar, porque nada foi escrito.
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** FAZ
-- ------------------------------------------------
-- Não filtra SOS cancelado. Hoje um SOS cancelado ainda pinta risco máximo,
-- porque nem este ramo nem o original olham `status`. Isso é anterior à
-- RC2-B, não é regressão, e mudar merece decisão de produto: "cancelei porque
-- foi engano" e "cancelei porque já resolvi sozinho" são coisas diferentes, e
-- só o dono do produto decide se as duas devem sumir do mapa de risco.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.risk_heatmap(
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 25,
  _days integer DEFAULT 14
)
RETURNS TABLE (lat double precision, lng double precision, weight integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH pts AS (
    -- Somente alerta manual. O espelho do SOS (sos_event_id NOT NULL) é
    -- contado no ramo de baixo, uma vez só.
    SELECT a.lat AS lat, a.lng AS lng,
      CASE WHEN a.type IN ('roubo','acidente') THEN 3 ELSE 2 END AS w
    FROM public.community_alerts a
    WHERE a.created_at > now() - (greatest(_days,1) || ' days')::interval
      AND a.sos_event_id IS NULL
    UNION ALL
    SELECT s.latitude::double precision, s.longitude::double precision, 4
    FROM public.sos_events s
    WHERE s.triggered_at > now() - (greatest(_days,1) || ' days')::interval
      AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
  )
  SELECT
    round(p.lat::numeric, 3)::double precision AS lat,
    round(p.lng::numeric, 3)::double precision AS lng,
    sum(p.w)::int AS weight
  FROM pts p
  WHERE auth.uid() IS NOT NULL
    AND (6371 * acos(least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(p.lat))
    )))) <= greatest(_radius_km, 1)
  GROUP BY 1, 2
  LIMIT 500
$$;

REVOKE ALL ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) TO authenticated;

COMMENT ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) IS
  'Mapa de risco. Conta alerta manual (community_alerts com sos_event_id NULL) e sos_events. O espelho de SOS e ignorado para nao contar o mesmo evento duas vezes.';
