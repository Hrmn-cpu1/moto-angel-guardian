CREATE TABLE public.native_auth_codes (
  code text PRIMARY KEY,
  code_challenge text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.native_auth_codes TO service_role;
ALTER TABLE public.native_auth_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_native_auth_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.native_auth_codes
  WHERE expires_at < now() OR used_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.purge_native_auth_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_native_auth_codes() TO service_role;