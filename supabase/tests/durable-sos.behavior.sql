-- Run ONLY in an isolated test database with the minimal baseline documented in
-- test-sos-database.sh. No HTTP functions, real tokens, or actual sends are used.
INSERT INTO profiles VALUES ('00000000-0000-4000-8000-000000000001','QA','');
INSERT INTO sos_events(id,user_id,status,latitude,longitude) VALUES
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','active',-23,-46);
INSERT INTO whatsapp_notifications(id,sos_event_id,user_id,recipient_phone) VALUES
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','5511000000000');
DO $$
DECLARE n integer; v boolean; row_status text;
BEGIN
 SELECT count(*) INTO n FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000010');
 IF n <> 1 THEN RAISE EXCEPTION 'Expected one queued claim, got %',n; END IF;
 SELECT count(*) INTO n FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000011');
 IF n <> 0 THEN RAISE EXCEPTION 'Claimed the same notification twice'; END IF;
 SELECT settle_sos_dispatch('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000011','sent','wrong-token') INTO v;
 IF v THEN RAISE EXCEPTION 'Wrong lease token settled'; END IF;
 -- Webhook arrives before HTTP response is persisted.
 PERFORM receive_sos_delivery('wamid.qa','read',now());
 PERFORM settle_sos_dispatch('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000010','sent','wamid.qa');
 PERFORM receive_sos_delivery('wamid.qa','delivered',now());
 PERFORM receive_sos_delivery('wamid.qa','failed',now());
 SELECT status INTO row_status FROM whatsapp_notifications WHERE id='00000000-0000-4000-8000-000000000003';
 IF row_status <> 'read' THEN RAISE EXCEPTION 'Receipt regressed: %',row_status; END IF;
 IF (SELECT count(*) FROM sos_delivery_receipts WHERE provider_message_id='wamid.qa') <> 1 THEN RAISE EXCEPTION 'Duplicate receipt'; END IF;
 IF has_function_privilege('authenticated','public.claim_due_sos_notifications(uuid,uuid,boolean,integer)','EXECUTE') THEN RAISE EXCEPTION 'Client can dispatch'; END IF;
 IF has_function_privilege('anon','public.receive_sos_delivery(text,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Anon can forge delivery'; END IF;
END;
$$;
INSERT INTO whatsapp_notifications(id,sos_event_id,user_id,recipient_phone,status,claimed_at,claim_token,attempts) VALUES
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','5511000000001','sending',now()-interval '3 minutes','00000000-0000-4000-8000-000000000010',1);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000012');
 IF n <> 0 OR (SELECT status FROM whatsapp_notifications WHERE id='00000000-0000-4000-8000-000000000004') <> 'unknown' THEN RAISE EXCEPTION 'Abandoned send was retried'; END IF;
END;
$$;
INSERT INTO whatsapp_notifications(id,sos_event_id,user_id,recipient_phone) VALUES
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','5511000000002');
DO $$
DECLARE n integer;
BEGIN
 PERFORM claim_due_sos_notifications('00000000-0000-4000-8000-000000000013');
 PERFORM settle_sos_dispatch('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000013','failed',NULL,'429',true);
 SELECT count(*) INTO n FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000014');
 IF n <> 0 THEN RAISE EXCEPTION 'Retry ignored backoff'; END IF;
 UPDATE whatsapp_notifications SET next_attempt_at=now()-interval '1 second',attempts=2 WHERE id='00000000-0000-4000-8000-000000000005';
 SELECT count(*) INTO n FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000015');
 IF n <> 1 THEN RAISE EXCEPTION 'Due retry not claimed'; END IF;
 PERFORM settle_sos_dispatch('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000015','failed',NULL,'429',true);
 IF (SELECT retryable FROM whatsapp_notifications WHERE id='00000000-0000-4000-8000-000000000005') THEN RAISE EXCEPTION 'Exceeded three attempts'; END IF;
END;
$$;
-- Closed and stale events do not generate delayed emergency notifications.
INSERT INTO sos_events(id,user_id,status,triggered_at) VALUES
 ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','cancelled',now()),
 ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','active',now()-interval '1 hour');
INSERT INTO whatsapp_notifications(sos_event_id,user_id,recipient_phone) SELECT id,user_id,'5511000000003' FROM sos_events WHERE id IN ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000007');
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM claim_due_sos_notifications('00000000-0000-4000-8000-000000000016')) THEN RAISE EXCEPTION 'Closed/stale event dispatched'; END IF;
END;
$$;
