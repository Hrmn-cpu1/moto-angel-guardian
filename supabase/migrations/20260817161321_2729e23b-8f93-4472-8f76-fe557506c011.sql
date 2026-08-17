REVOKE ALL ON FUNCTION public.purge_native_auth_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_native_auth_codes() FROM anon;
REVOKE ALL ON FUNCTION public.purge_native_auth_codes() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_native_auth_codes() TO service_role;