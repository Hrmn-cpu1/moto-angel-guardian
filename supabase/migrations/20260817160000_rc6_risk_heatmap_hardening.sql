-- ============================================================================
-- RC5+ SECURITY HARDENING — risk_heatmap deixa de ser uma janela para o
-- histórico de localização de SOS.
--
-- PROBLEMA (verificado no código, não suposto)
-- --------------------------------------------
-- A definição vigente (20260815120000) é SECURITY DEFINER, portanto lê
-- `sos_events` ignorando a RLS que restringe cada evento ao seu dono, e:
--   . confia em `_radius_km` e `_days` vindos do cliente (só aplica
--     `greatest(x,1)`, ou seja, aceita raio 20000 km = planeta inteiro);
--   . não valida latitude/longitude;
--   . agrega em grade de 3 casas decimais (~110 m) ANCORADA no valor
--     arredondado do próprio ponto, o que devolve praticamente a coordenada
--     original da vítima;
--   . devolve o peso somado sem teto, permitindo inferir quantos eventos há
--     numa célula.
-- Combinando essas quatro coisas, um usuário autenticado qualquer podia varrer
-- o país e reconstruir o histórico de SOS alheio com precisão de rua.
--
-- CORREÇÃO
-- --------
--   . caller obrigatoriamente autenticado (falha fechada, com erro 42501);
--   . lat/lng validados (faixa geográfica e NaN);
--   . raio limitado a 25 km e janela a 14 dias NO SERVIDOR — o que o cliente
--     manda é apenas um pedido, nunca o limite;
--   . agregação numa grade GLOBAL FIXA de 0,01° (~1,1 km) cujos centros não
--     dependem do centro consultado: repetir a consulta deslocando o centro
--     devolve exatamente as mesmas células, então não há triangulação;
--   . peso saturado em 12, para a célula não revelar contagem de eventos;
--   . resposta continua sem user_id, sem sos_event_id, sem timestamp e sem
--     qualquer coordenada individual de vítima.
--
-- PRESERVADO
-- ----------
--   . assinatura idêntica (frontend inalterado);
--   . filtro RC5 `a.sos_event_id IS NULL` — SOS continua contado uma vez só;
--   . `sos_events` continua sendo a fonte do peso 4 do SOS;
--   . grants: PUBLIC/anon sem EXECUTE, apenas `authenticated`.
--
-- SECURITY DEFINER é mantido por necessidade arquitetural: o mapa de risco
-- precisa somar eventos de terceiros, que a RLS (corretamente) esconde do
-- leitor. A mitigação é a agregação irreversível acima, não o acesso.
--
-- ROLLBACK
-- --------
-- Reaplicar o corpo de 20260815120000. Nenhuma linha é escrita por esta
-- migration; a mudança é somente de leitura.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.risk_heatmap(
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 25,
  _days integer DEFAULT 14
)
RETURNS TABLE (lat double precision, lng double precision, weight integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_radius double precision;
  v_days integer;
  c_grid  constant double precision := 0.01;  -- ~1,1 km
  c_max_radius_km constant double precision := 25;
  c_max_days constant integer := 14;
  c_max_weight constant integer := 12;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'risk_heatmap: autenticacao obrigatoria'
      USING ERRCODE = '42501';
  END IF;

  IF _lat IS NULL OR _lng IS NULL
     OR _lat <> _lat OR _lng <> _lng            -- NaN
     OR _lat < -90 OR _lat > 90
     OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'risk_heatmap: coordenadas invalidas'
      USING ERRCODE = '22023';
  END IF;

  -- Limites do servidor. O cliente pede; quem decide e a funcao.
  v_radius := least(greatest(coalesce(_radius_km, c_max_radius_km), 1), c_max_radius_km);
  v_days   := least(greatest(coalesce(_days, c_max_days), 1), c_max_days);

  RETURN QUERY
  WITH pts AS (
    -- Somente alerta manual. O espelho do SOS (sos_event_id NOT NULL) e
    -- contado no ramo de baixo, uma vez so (RC5).
    SELECT a.lat AS lat, a.lng AS lng,
      CASE WHEN a.type IN ('roubo','acidente') THEN 3 ELSE 2 END AS w
    FROM public.community_alerts a
    WHERE a.created_at > now() - (v_days || ' days')::interval
      AND a.sos_event_id IS NULL
      AND a.lat IS NOT NULL AND a.lng IS NOT NULL
    UNION ALL
    SELECT s.latitude::double precision, s.longitude::double precision, 4
    FROM public.sos_events s
    WHERE s.triggered_at > now() - (v_days || ' days')::interval
      AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
  ),
  perto AS (
    SELECT p.lat, p.lng, p.w
    FROM pts p
    WHERE (6371 * acos(least(1, greatest(-1,
            cos(radians(_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(_lng))
            + sin(radians(_lat)) * sin(radians(p.lat))
          )))) <= v_radius
  )
  SELECT
    -- Grade global fixa: o centro da celula nao depende do centro consultado,
    -- entao consultas repetidas com centros diferentes nao aumentam a
    -- resolucao nem permitem triangular o ponto original.
    (floor(q.lat / c_grid) * c_grid + c_grid / 2)::double precision AS lat,
    (floor(q.lng / c_grid) * c_grid + c_grid / 2)::double precision AS lng,
    least(sum(q.w), c_max_weight)::int AS weight
  FROM perto q
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) TO authenticated;

COMMENT ON FUNCTION public.risk_heatmap(double precision, double precision, double precision, integer) IS
  'Mapa de risco agregado. Exige caller autenticado, valida lat/lng, limita raio a 25km e janela a 14 dias no servidor, agrega em grade global fixa de 0.01 grau com peso saturado. Nao devolve user_id, sos_event_id, timestamp nem coordenada individual. Mantem o filtro RC5 (community_alerts.sos_event_id IS NULL) para nao contar SOS duas vezes.';
