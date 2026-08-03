create or replace function public.risk_heatmap(
  _lat double precision,
  _lng double precision,
  _radius_km double precision default 25,
  _days integer default 14
)
returns table(lat double precision, lng double precision, weight integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with pts as (
    select a.lat as lat, a.lng as lng,
      case when a.type in ('roubo','acidente') then 3 else 2 end as w
    from public.community_alerts a
    where a.created_at > now() - (greatest(_days,1) || ' days')::interval
    union all
    select s.latitude::double precision, s.longitude::double precision, 4
    from public.sos_events s
    where s.triggered_at > now() - (greatest(_days,1) || ' days')::interval
      and s.latitude is not null and s.longitude is not null
  )
  select
    round(p.lat::numeric, 3)::double precision as lat,
    round(p.lng::numeric, 3)::double precision as lng,
    sum(p.w)::int as weight
  from pts p
  where auth.uid() is not null
    and (6371 * acos(least(1, greatest(-1,
      cos(radians(_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(_lng))
      + sin(radians(_lat)) * sin(radians(p.lat))
    )))) <= greatest(_radius_km, 1)
  group by 1, 2
  limit 500
$$;

revoke all on function public.risk_heatmap(double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.risk_heatmap(double precision, double precision, double precision, integer) to authenticated;