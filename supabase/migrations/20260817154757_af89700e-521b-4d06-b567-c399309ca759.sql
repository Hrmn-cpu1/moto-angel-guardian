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
  c_grid  constant double precision := 0.01;
  c_max_radius_km constant double precision := 25;
  c_max_days constant integer := 14;
  c_max_weight constant integer := 12;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'risk_heatmap: autenticacao obrigatoria'
      USING ERRCODE = '42501';
  END IF;

  IF _lat IS NULL OR _lng IS NULL
     OR _lat <> _lat OR _lng <> _lng
     OR _lat < -90 OR _lat > 90
     OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'risk_heatmap: coordenadas invalidas'
      USING ERRCODE = '22023';
  END IF;

  v_radius := least(greatest(coalesce(_radius_km, c_max_radius_km), 1), c_max_radius_km);
  v_days   := least(greatest(coalesce(_days, c_max_days), 1), c_max_days);

  RETURN QUERY
  WITH pts AS (
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