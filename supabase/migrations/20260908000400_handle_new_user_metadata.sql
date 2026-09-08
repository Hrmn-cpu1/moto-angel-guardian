-- Migration: Salvar metadados completos de cadastro e criar contato primário de emergência
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_phone TEXT;
  v_bike_model TEXT;
  v_plate TEXT;
  v_blood_type TEXT;
  v_emergency_contact TEXT;
  v_emergency_phone TEXT;
  v_terms_version TEXT;
  v_terms_accepted_at TIMESTAMPTZ;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,''), '@', 1));
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  v_bike_model := COALESCE(NEW.raw_user_meta_data->>'bike_model', '');
  v_plate := COALESCE(NEW.raw_user_meta_data->>'plate', '');
  v_blood_type := COALESCE(NEW.raw_user_meta_data->>'blood_type', '');
  v_emergency_contact := COALESCE(NEW.raw_user_meta_data->>'emergency_contact', '');
  v_emergency_phone := COALESCE(NEW.raw_user_meta_data->>'emergency_phone', '');
  v_terms_version := NEW.raw_user_meta_data->>'terms_version';
  
  IF NEW.raw_user_meta_data->>'terms_accepted_at' IS NOT NULL THEN
    BEGIN
      v_terms_accepted_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_terms_accepted_at := now();
    END;
  ELSE
    v_terms_accepted_at := NULL;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    name,
    phone,
    bike_model,
    plate,
    blood_type,
    emergency_contact,
    emergency_phone,
    terms_version,
    terms_accepted_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    v_name,
    v_phone,
    v_bike_model,
    v_plate,
    v_blood_type,
    v_emergency_contact,
    v_emergency_phone,
    v_terms_version,
    v_terms_accepted_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = CASE WHEN profiles.name = '' OR profiles.name IS NULL THEN EXCLUDED.name ELSE profiles.name END,
    phone = CASE WHEN profiles.phone = '' OR profiles.phone IS NULL THEN EXCLUDED.phone ELSE profiles.phone END,
    bike_model = CASE WHEN profiles.bike_model = '' OR profiles.bike_model IS NULL THEN EXCLUDED.bike_model ELSE profiles.bike_model END,
    plate = CASE WHEN profiles.plate = '' OR profiles.plate IS NULL THEN EXCLUDED.plate ELSE profiles.plate END,
    blood_type = CASE WHEN profiles.blood_type = '' OR profiles.blood_type IS NULL THEN EXCLUDED.blood_type ELSE profiles.blood_type END,
    emergency_contact = CASE WHEN profiles.emergency_contact = '' OR profiles.emergency_contact IS NULL THEN EXCLUDED.emergency_contact ELSE profiles.emergency_contact END,
    emergency_phone = CASE WHEN profiles.emergency_phone = '' OR profiles.emergency_phone IS NULL THEN EXCLUDED.emergency_phone ELSE profiles.emergency_phone END,
    terms_version = COALESCE(profiles.terms_version, EXCLUDED.terms_version),
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);

  -- Se foi informado contato de emergência no cadastro, cria o primeiro contato de confiança
  IF v_emergency_contact <> '' AND v_emergency_phone <> '' THEN
    INSERT INTO public.emergency_contacts (user_id, name, phone, relation, is_primary)
    SELECT NEW.id, v_emergency_contact, v_emergency_phone, 'Contato de emergência', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.emergency_contacts WHERE user_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
