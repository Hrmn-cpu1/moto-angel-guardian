create or replace function public.online_riders(_lat double precision, _lng double precision, _radius_km double precision default 50, _minutes integer default 10)
returns table(
  user_id uuid,
  name text,
  avatar_url text,
  lat double precision,
  lng double precision,
  speed_kmh double precision,
  heading double precision,
  updated_at timestamptz,
  distance_km double precision
)
language sql
stable
security definer
set search_path to 'public'
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
    and l.updated_at > now() - (greatest(_minutes,1) || ' minutes')::interval
    and (6371 * acos(least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(l.lat))
    )))) <= greatest(_radius_km, 1)
  order by distance_km asc
  limit 50;
$$;

revoke all on function public.online_riders(double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.online_riders(double precision, double precision, double precision, integer) to authenticated;