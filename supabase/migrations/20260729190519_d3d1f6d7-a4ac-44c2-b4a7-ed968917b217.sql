CREATE TABLE public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL REFERENCES public.sos_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emergency_contact_id uuid REFERENCES public.emergency_contacts(id) ON DELETE SET NULL,
  recipient_name text NOT NULL DEFAULT '',
  recipient_phone text NOT NULL,
  provider text NOT NULL DEFAULT 'meta_whatsapp',
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wn_sos_event ON public.whatsapp_notifications(sos_event_id);
CREATE INDEX idx_wn_user ON public.whatsapp_notifications(user_id);
CREATE INDEX idx_wn_status ON public.whatsapp_notifications(status);

GRANT SELECT ON public.whatsapp_notifications TO authenticated;
GRANT ALL ON public.whatsapp_notifications TO service_role;

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY wn_select_own ON public.whatsapp_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_notifications;
ALTER TABLE public.whatsapp_notifications REPLICA IDENTITY FULL;