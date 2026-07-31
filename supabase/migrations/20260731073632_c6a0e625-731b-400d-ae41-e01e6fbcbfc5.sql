create or replace function public.user_history(_limit integer default 50)
returns table(id text, kind text, title text, description text, ts timestamptz, meta jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select
      'trip-' || tr.id::text as id,
      'trip'::text as kind,
      'Viagem concluída'::text as title,
      round(tr.distance_km, 1)::text || ' km em ' ||
        (tr.duration_seconds / 60)::text || 'm ' ||
        lpad((tr.duration_seconds % 60)::text, 2, '0') || 's' as description,
      coalesce(tr.ended_at, tr.started_at) as ts,
      jsonb_build_object(
        'distance', tr.distance_km,
        'duration', tr.duration_seconds,
        'companion', coalesce(tr.companion, '')
      ) as meta
    from public.trips tr
    where tr.user_id = auth.uid()
    order by coalesce(tr.ended_at, tr.started_at) desc
    limit greatest(_limit, 1)
  ),
  s as (
    select
      'sos-' || se.id::text as id,
      'sos'::text as kind,
      'Alerta SOS ativado'::text as title,
      coalesce(
        se.address,
        case when se.latitude is not null and se.longitude is not null
          then round(se.latitude, 5)::text || ', ' || round(se.longitude, 5)::text
          else 'Localização indisponível' end
      ) as description,
      se.triggered_at as ts,
      jsonb_build_object(
        'lat', se.latitude,
        'lng', se.longitude,
        'note', coalesce(se.note, '')
      ) as meta
    from public.sos_events se
    where se.user_id = auth.uid()
    order by se.triggered_at desc
    limit greatest(_limit, 1)
  )
  select * from (select * from t union all select * from s) x
  order by x.ts desc
  limit greatest(_limit, 1)
$$;

grant execute on function public.user_history(integer) to authenticated;