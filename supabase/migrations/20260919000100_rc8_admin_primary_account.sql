-- CHECKPOINT RC8 — administrador principal: sincronização do banco real
-- Esta migration existe porque alterar uma migration histórica não altera
-- uma base Supabase que já recebeu aquela migration.

create or replace function public.admin_email_fixo()
returns text
language sql
immutable
set search_path = public
as $$ select 'charadas1315@gmail.com'::text $$;

-- Remove qualquer papel admin que não pertença ao administrador principal.
delete from public.user_roles r
where r.role = 'admin'::public.app_role
  and r.user_id not in (
    select u.id
    from auth.users u
    where lower(u.email) = public.admin_email_fixo()
  );

-- Garante o papel admin caso a conta principal já exista.
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) = public.admin_email_fixo()
on conflict (user_id, role) do nothing;

grant execute on function public.admin_email_fixo() to authenticated;
revoke all on function public.admin_email_fixo() from public, anon;
