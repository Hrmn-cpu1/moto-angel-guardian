-- Run after the durable delivery migration, as the database owner.
-- This installs a DISABLED job. It does not create secrets or send messages.
-- Prerequisites: Supabase pg_cron, pg_net and Vault available to the database owner.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_sos_dispatch_schedule()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE endpoint text; bearer text; enabled text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO enabled FROM vault.decrypted_secrets WHERE name = 'moto_anjo_sos_enabled' LIMIT 1;
 IF enabled IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name = 'moto_anjo_sos_dispatch_url' LIMIT 1;
 SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets WHERE name = 'moto_anjo_sos_dispatch_secret' LIMIT 1;
 IF endpoint IS NULL OR endpoint !~ '^https://[^/]+/api/internal/sos-dispatch$'
   OR bearer IS NULL OR length(bearer) < 32 THEN
   RAISE EXCEPTION 'SOS scheduler configuration incomplete';
 END IF;
 SELECT net.http_post(url := endpoint,
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || bearer),
   body := '{}'::jsonb, timeout_milliseconds := 25000) INTO request_id;
 RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.run_sos_dispatch_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_sos_dispatch_schedule() TO service_role;

DO $$
DECLARE job bigint;
BEGIN
 SELECT cron.schedule('moto-anjo-sos-dispatch', '* * * * *', 'SELECT public.run_sos_dispatch_schedule();') INTO job;
 PERFORM cron.alter_job(job, active := false);
END;
$$;

-- Activation is an operational gate, not part of this installer:
-- 1. Set server SOS_DELIVERY_ENABLED=true only after approved template and consented QA.
-- 2. Store the exact HTTPS route and matching server secret in Vault using the names above.
-- 3. Set Vault moto_anjo_sos_enabled=true.
-- 4. SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname='moto-anjo-sos-dispatch';
-- To stop: disable the cron job AND set server SOS_DELIVERY_ENABLED=false.
-- Verify scheduler HTTP receipts via net._http_response (request id/status only; never expose headers).
