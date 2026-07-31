create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  viewer_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, viewer_id),
  constraint location_shares_status_check check (status in ('pending','approved','revoked')),
  constraint location_shares_not_self check (owner_id <> viewer_id)
);

grant select, insert, update, delete on public.location_shares to authenticated;
grant all on public.location_shares to service_role;

alter table public.location_shares enable row level security;

create policy "ls_select_participants" on public.location_shares
for select to authenticated
using (auth.uid() = owner_id or auth.uid() = viewer_id);

create policy "ls_insert_request" on public.location_shares
for insert to authenticated
with check (auth.uid() = viewer_id and status = 'pending');

create policy "ls_update_owner" on public.location_shares
for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id and status in ('approved','revoked'));

create policy "ls_delete_participants" on public.location_shares
for delete to authenticated
using (auth.uid() = owner_id or auth.uid() = viewer_id);

create trigger location_shares_set_updated_at
before update on public.location_shares
for each row execute function public.set_updated_at();

-- verified linkage replaces phone-substring matching
create or replace function public.is_trusted_contact(_owner uuid, _viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.location_shares s
    where s.owner_id = _owner
      and s.viewer_id = _viewer
      and s.status = 'approved'
  )
$$;

revoke execute on function public.is_trusted_contact(uuid, uuid) from public, anon;
grant execute on function public.is_trusted_contact(uuid, uuid) to authenticated, service_role;

-- request access to someone already saved in the caller's emergency contacts
create or replace function public.request_location_access(_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _viewer uuid := auth.uid();
  _owner uuid;
  _digits text := public.normalize_phone(_phone);
begin
  if _viewer is null then
    raise exception 'forbidden';
  end if;
  if _digits is null or length(_digits) < 8 then
    return 'invalid_phone';
  end if;

  -- the phone must already be one of the caller's emergency contacts
  if not exists (
    select 1 from public.emergency_contacts ec
    where ec.user_id = _viewer
      and right(public.normalize_phone(ec.phone), 8) = right(_digits, 8)
  ) then
    return 'not_a_contact';
  end if;

  select p.id into _owner
  from public.profiles p
  where public.normalize_phone(p.phone) is not null
    and right(public.normalize_phone(p.phone), 8) = right(_digits, 8)
    and p.id <> _viewer
  limit 1;

  if _owner is null then
    return 'no_account';
  end if;

  insert into public.location_shares (owner_id, viewer_id, status)
  values (_owner, _viewer, 'pending')
  on conflict (owner_id, viewer_id) do nothing;

  return 'requested';
end;
$$;

revoke execute on function public.request_location_access(text) from public, anon;
grant execute on function public.request_location_access(text) to authenticated;

-- incoming requests / granted viewers, with safe profile fields only
create or replace function public.location_share_inbox()
returns table(id uuid, viewer_id uuid, viewer_name text, viewer_avatar text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.viewer_id,
    coalesce(nullif(p.name, ''), 'Motociclista') as viewer_name,
    p.avatar_url as viewer_avatar,
    s.status, s.created_at
  from public.location_shares s
  left join public.profiles p on p.id = s.viewer_id
  where auth.uid() is not null and s.owner_id = auth.uid()
  order by (s.status = 'pending') desc, s.created_at desc
  limit 100;
$$;

revoke execute on function public.location_share_inbox() from public, anon;
grant execute on function public.location_share_inbox() to authenticated;