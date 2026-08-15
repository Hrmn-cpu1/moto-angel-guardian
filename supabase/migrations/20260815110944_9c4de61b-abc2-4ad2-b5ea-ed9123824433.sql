-- CHECKPOINT RC5 — cópia carimbada pelo aplicador de migrations.
-- Conteúdo idêntico a 20260815120000_rc5_heatmap_sem_dupla_contagem.sql.

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