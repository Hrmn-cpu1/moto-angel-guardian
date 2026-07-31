revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.grant_admin_for_fixed_email() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_activity(integer) from public, anon;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_activity(integer) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;