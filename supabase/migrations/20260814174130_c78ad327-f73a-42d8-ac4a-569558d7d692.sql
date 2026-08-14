-- ============================================================================
-- CHECKPOINT RC2-C — MOTOQUEIROS PRÓXIMOS (v2, opt-in estrito)
--
-- Migration ADITIVA, ainda NÃO aplicada em banco. A v1 desta mesma migration
-- foi corrigida antes da primeira aplicação, conforme autorizado.
--
-- O QUE MUDOU DA v1 PARA A v2
-- ---------------------------
-- A v1 usava, dentro de online_riders:
--
--     is_trusted_contact(l.user_id, auth.uid()) OR p.share_with_riders
--
-- Isso furava o opt-in: um contato autorizado aparecia na camada comunitária
-- mesmo com "aparecer para outros motoqueiros" DESLIGADO. Estava errado.
-- Comunidade pública e contato confiável são duas visibilidades diferentes e
-- agora vivem em duas funções diferentes.
--
--   online_riders()            -> DESCOBERTA COMUNITÁRIA. Exige opt-in.
--   trusted_contacts_online()  -> RELAÇÃO PRIVADA. É o comportamento que já
--                                 existia antes do RC2 e continua igual.
--
-- REGRA EXATA DE online_riders
-- ----------------------------
--   . auth.uid() obrigatório;
--   . nunca o próprio usuário;
--   . live_locations.sharing = true          (interruptor mestre);
--   . profiles.share_with_riders = true      (opt-in explícito);
--   . posição recente (TTL em _minutes);
--   . dentro do raio (_radius_km);
--   . somente dados mínimos.
--
--   sharing ON  + opt-in OFF -> NÃO aparece
--   sharing ON  + opt-in ON  -> aparece
--   sharing OFF + opt-in ON  -> NÃO aparece
--
-- REGRA EXATA DE trusted_contacts_online
-- --------------------------------------
--   . mesmas exigências, trocando o opt-in por is_trusted_contact();
--   . não exige share_with_riders: autorizar um contato é um ato explícito
--     do dono, feito em location_shares, e não depende da camada pública.
--
-- LIMITES DO SERVIDOR (hotfix P0.4-B)
-- ----------------------------------
-- Raio e TTL vindos do cliente são sugestão, não autorização. Os tetos vivem
-- no SQL, com LEAST/GREATEST:
--
--   online_riders           raio 1..50 km   TTL 1..15 min
--   trusted_contacts_online raio 1..100 km  TTL 1..30 min
--
-- A comunidade é mais apertada de propósito: descoberta pública de
-- desconhecidos merece janela menor que o acompanhamento de um contato que
-- você autorizou. Em nenhum dos dois casos uma posição antiga é chamada de
-- "online". A UI usa 50 km e 10 min, então o contrato atual não muda.
--
-- PRIVACIDADE (idêntica nas duas)
-- -------------------------------
--   user_id, primeiro nome, avatar, lat, lng, velocidade, direção,
--   updated_at, distância. Nada de e-mail, telefone, documento ou token.
--
-- ROLLBACK CONCEITUAL
-- -------------------
--   drop function public.trusted_contacts_online(double precision, double precision, double precision, integer);
--   update public.profiles set share_with_riders = false;
--   -- e reaplicar o corpo anterior de online_riders (migration 20260731130155).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_with_riders boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.share_with_riders IS
  'Opt-in explicito para a camada comunitaria de motociclistas proximos. Default false. Nao afeta contatos autorizados, que tem funcao propria.';

CREATE INDEX IF NOT EXISTS idx_profiles_share_with_riders
  ON public.profiles (id)
  WHERE share_with_riders = true;

CREATE OR REPLACE FUNCTION public.online_riders(
  _lat       double precision,
  _lng       double precision,
  _radius_km double precision DEFAULT 50,
  _minutes   integer DEFAULT 10
)
RETURNS TABLE (
  user_id    uuid,
  name       text,
  avatar_url text,
  lat        double precision,
  lng        double precision,
  speed_kmh  double precision,
  heading    double precision,
  updated_at timestamptz,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ORIGEM: posição recente do próprio viewer (P0.5-A). _lat/_lng do cliente
  -- continuam na assinatura mas não decidem mais nada — é isso que impede o
  -- grid scan por coordenadas arbitrárias.
  WITH eu AS (
    SELECT me.lat, me.lng
      FROM public.live_locations me
     WHERE me.user_id = auth.uid()
       AND me.updated_at > now() - interval '15 minutes'
       AND me.lat BETWEEN -90 AND 90
       AND me.lng BETWEEN -180 AND 180
       AND NOT (me.lat = 0 AND me.lng = 0)
  ),
  lim AS (
    SELECT
      LEAST(GREATEST(COALESCE(_radius_km, 50), 1), 50)::double precision AS radius_km,
      LEAST(GREATEST(COALESCE(_minutes, 10), 1), 15)::integer            AS minutos
  )
  SELECT
    l.user_id,
    COALESCE(NULLIF(split_part(COALESCE(p.name,''), ' ', 1), ''), 'Motociclista') AS name,
    p.avatar_url,
    l.lat,
    l.lng,
    l.speed_kmh,
    l.heading,
    l.updated_at,
    (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(l.lat))
    )))) AS distance_km
  FROM public.live_locations l
  CROSS JOIN eu
  CROSS JOIN lim
  JOIN public.profiles p ON p.id = l.user_id
  WHERE auth.uid() IS NOT NULL
    AND l.user_id <> auth.uid()
    AND l.sharing = true
    AND p.share_with_riders = true
    AND l.updated_at > now() - (lim.minutos || ' minutes')::interval
    AND (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(l.lat))
    )))) <= lim.radius_km
  ORDER BY distance_km ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.online_riders(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_riders(double precision, double precision, double precision, integer) TO authenticated;

COMMENT ON FUNCTION public.online_riders(double precision, double precision, double precision, integer) IS
  'Camada comunitaria. Origem = presenca recente da propria conta (reduz varredura; nao prova onde o aparelho esta). Exige sharing E share_with_riders do outro lado, posicao recente e raio. Sem presenca recente, devolve vazio.';

-- ----------------------------------------------------------------------------
-- trusted_contacts_online: mesma origem. O recurso legítimo (acompanhar um
-- contato autorizado) continua, porque a UI sempre usou a própria posição
-- como centro — nada muda para o usuário, só some a possibilidade de varrer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trusted_contacts_online(
  _lat       double precision,
  _lng       double precision,
  _radius_km double precision DEFAULT 50,
  _minutes   integer DEFAULT 10
)
RETURNS TABLE (
  user_id    uuid,
  name       text,
  avatar_url text,
  lat        double precision,
  lng        double precision,
  speed_kmh  double precision,
  heading    double precision,
  updated_at timestamptz,
  distance_km double precision
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
      LEAST(GREATEST(COALESCE(_radius_km, 50), 1), 100)::double precision AS radius_km,
      LEAST(GREATEST(COALESCE(_minutes, 10), 1), 30)::integer             AS minutos
  )
  SELECT
    l.user_id,
    COALESCE(NULLIF(split_part(COALESCE(p.name,''), ' ', 1), ''), 'Motociclista') AS name,
    p.avatar_url,
    l.lat,
    l.lng,
    l.speed_kmh,
    l.heading,
    l.updated_at,
    (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(l.lat))
    )))) AS distance_km
  FROM public.live_locations l
  CROSS JOIN eu
  CROSS JOIN lim
  LEFT JOIN public.profiles p ON p.id = l.user_id
  WHERE auth.uid() IS NOT NULL
    AND l.user_id <> auth.uid()
    AND l.sharing = true
    AND public.is_trusted_contact(l.user_id, auth.uid())
    AND l.updated_at > now() - (lim.minutos || ' minutes')::interval
    AND (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(eu.lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(eu.lng))
      + sin(radians(eu.lat)) * sin(radians(l.lat))
    )))) <= lim.radius_km
  ORDER BY distance_km ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.trusted_contacts_online(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trusted_contacts_online(double precision, double precision, double precision, integer) TO authenticated;