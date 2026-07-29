ALTER TABLE public.emergency_contacts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_contacts;