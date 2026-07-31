-- 1) Community alerts
CREATE TABLE public.community_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('perigo','acidente','bloqueio','roubo')),
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_alerts TO authenticated;
GRANT ALL ON public.community_alerts TO service_role;
ALTER TABLE public.community_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts readable by authenticated" ON public.community_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts insert own" ON public.community_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts update own" ON public.community_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts delete own" ON public.community_alerts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX community_alerts_created_idx ON public.community_alerts (created_at DESC);
ALTER TABLE public.community_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_alerts;

CREATE OR REPLACE FUNCTION public.nearby_alerts(_lat DOUBLE PRECISION, _lng DOUBLE PRECISION, _radius_km DOUBLE PRECISION DEFAULT 25, _hours INTEGER DEFAULT 24)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  description TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  author_name TEXT,
  distance_km DOUBLE PRECISION,
  is_mine BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.type, a.title, a.description, a.address, a.lat, a.lng, a.created_at,
    COALESCE(p.name, 'Motociclista') AS author_name,
    (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(a.lat))
    )))) AS distance_km,
    (a.user_id = auth.uid()) AS is_mine
  FROM public.community_alerts a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND a.created_at > now() - (_hours || ' hours')::interval
    AND (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(a.lat))
    )))) <= _radius_km
  ORDER BY a.created_at DESC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.nearby_alerts(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_alerts(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;

-- 2) Partners / benefits
CREATE TABLE public.partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  benefit TEXT NOT NULL,
  detail TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners readable by authenticated" ON public.partners FOR SELECT TO authenticated USING (active);

INSERT INTO public.partners (name, category, benefit, detail, featured, sort_order) VALUES
('Descontos exclusivos para motoboys', 'destaque', 'Aproveite vantagens feitas especialmente para você', 'Benefícios ativos em toda a rede Moto Anjo.', true, 0),
('Posto Forte', 'combustivel', '10% de desconto em combustíveis', 'Válido em toda a rede participante mediante apresentação do app.', false, 1),
('Rede Pneus', 'pneus', 'Até 15% de desconto em pneus', 'Desconto aplicado na compra de pneus novos e balanceamento.', false, 2),
('Lava Rápido', 'lavagem', '20% de desconto na lavagem', 'Lavagem completa da moto com desconto exclusivo.', false, 3),
('Oficina Top', 'servicos', '15% de desconto em serviços', 'Revisões, troca de óleo e reparos com preço reduzido.', false, 4),
('Seguro Anjo', 'seguro', 'Cotação preferencial para associados', 'Condições especiais para motociclistas Moto Anjo.', false, 5);

-- 3) Continuous live location sharing
CREATE TABLE public.live_locations (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_kmh DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  sharing BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_locations TO authenticated;
GRANT ALL ON public.live_locations TO service_role;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live location own access" ON public.live_locations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.live_locations REPLICA IDENTITY FULL;