revoke execute on function public.is_trusted_contact(uuid, uuid) from public, anon;
revoke execute on function public.normalize_phone(text) from public, anon;
grant execute on function public.is_trusted_contact(uuid, uuid) to authenticated, service_role;
grant execute on function public.normalize_phone(text) to authenticated, service_role;