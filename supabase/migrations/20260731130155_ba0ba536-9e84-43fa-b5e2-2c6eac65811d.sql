-- normalize phone numbers to digits only for matching
create or replace function public.normalize_phone(_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), '')
$$;

-- _owner authorized _viewer to see their live position by adding the
-- viewer's phone to their own emergency contacts list
create or replace function public.is_trusted_contact(_owner uuid, _viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.emergency_contacts ec
    join public.profiles p on p.id = _viewer
    where ec.user_id = _owner
      and public.normalize_phone(ec.phone) is not null
      and public.normalize_phone(p.phone) is not null
      and right(public.normalize_phone(ec.phone), 8) = right(public.normalize_phone(p.phone), 8)
  )
$$;

grant execute on function public.normalize_phone(text) to authenticated, service_role;
grant execute on function public.is_trusted_contact(uuid, uuid) to authenticated, service_role;

-- allow authorized contacts to read a sharing rider's live position
drop policy if exists "live location trusted contacts read" on public.live_locations;
create policy "live location trusted contacts read"
on public.live_locations
for select
to authenticated
using (
  auth.uid() = user_id
  or (sharing = true and public.is_trusted_contact(user_id, auth.uid()))
);

-- online_riders now only returns authorized contacts
create or replace function public.online_riders(_lat double precision, _lng double precision, _radius_km double precision default 50, _minutes integer default 10)
returns table(user_id uuid, name text, avatar_url text, lat double precision, lng double precision, speed_kmh double precision, heading double precision, updated_at timestamp with time zone, distance_km double precision)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.user_id,
    coalesce(nullif(split_part(coalesce(p.name,''), ' ', 1), ''), 'Motociclista') as name,
    p.avatar_url,
    l.lat,
    l.lng,
    l.speed_kmh,
    l.heading,
    l.updated_at,
    (6371 * acos(least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(l.lat))
    )))) as distance_km
  from public.live_locations l
  left join public.profiles p on p.id = l.user_id
  where auth.uid() is not null
    and l.sharing = true
    and l.user_id <> auth.uid()
    and public.is_trusted_contact(l.user_id, auth.uid())
    and l.updated_at > now() - (greatest(_minutes,1) || ' minutes')::interval
    and (6371 * acos(least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(l.lat))
    )))) <= greatest(_radius_km, 1)
  order by distance_km asc
  limit 50;
$$;