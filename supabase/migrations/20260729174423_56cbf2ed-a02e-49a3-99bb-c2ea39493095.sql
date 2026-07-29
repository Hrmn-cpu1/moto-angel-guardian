
create or replace function public.admin_activity(_days int default 30)
returns table(day date, new_users bigint, trips bigint, sos bigint, posts bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  return query
  with days as (
    select (current_date - i)::date as day
    from generate_series(0, greatest(_days,1) - 1) as g(i)
  )
  select
    d.day,
    (select count(*) from public.profiles p where p.created_at::date = d.day),
    (select count(*) from public.trips t where t.started_at::date = d.day),
    (select count(*) from public.sos_events s where s.triggered_at::date = d.day),
    (select count(*) from public.community_posts cp where cp.created_at::date = d.day)
  from days d
  order by d.day asc;
end;
$$;
