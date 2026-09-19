-- Administrador principal do Moto Anjo
create or replace function public.admin_email_fixo()
returns text
language sql
immutable
set search_path = public
as $$ select 'charadas1315@gmail.com'::text $$;

-- has_role: admin exige o e-mail fixo (validação no backend)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _role = 'admin'::public.app_role then exists (
      select 1
      from auth.users u
      join public.user_roles r on r.user_id = u.id and r.role = 'admin'::public.app_role
      where u.id = _user_id
        and lower(u.email) = public.admin_email_fixo()
    )
    else exists (
      select 1 from public.user_roles where user_id = _user_id and role = _role
    )
  end
$$;

-- Trigger de promoção automática apenas para o e-mail fixo
create or replace function public.grant_admin_for_fixed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = public.admin_email_fixo() then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

-- Remove qualquer outro administrador
delete from public.user_roles r
where r.role = 'admin'::public.app_role
  and r.user_id not in (
    select u.id from auth.users u where lower(u.email) = public.admin_email_fixo()
  );

-- Garante o administrador se a conta já existir
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role from auth.users u
where lower(u.email) = public.admin_email_fixo()
on conflict (user_id, role) do nothing;

grant execute on function public.admin_email_fixo() to authenticated;
revoke all on function public.admin_email_fixo() from public, anon;