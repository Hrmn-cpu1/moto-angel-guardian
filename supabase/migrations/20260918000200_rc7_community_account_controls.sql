-- CHECKPOINT RC7 — comunidade: denúncias, bloqueios e exclusão de conta

create table if not exists public.community_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null default 'outro',
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null))
);

create index if not exists community_blocks_blocked_idx
  on public.community_user_blocks(blocked_id);
create index if not exists community_reports_status_idx
  on public.community_reports(status, created_at desc);

alter table public.community_user_blocks enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists cub_select on public.community_user_blocks;
create policy cub_select on public.community_user_blocks
  for select to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists cub_insert on public.community_user_blocks;
create policy cub_insert on public.community_user_blocks
  for insert to authenticated
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists cub_delete on public.community_user_blocks;
create policy cub_delete on public.community_user_blocks
  for delete to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists cr_select on public.community_reports;
create policy cr_select on public.community_reports
  for select to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists cr_insert on public.community_reports;
create policy cr_insert on public.community_reports
  for insert to authenticated
  with check (auth.uid() = reporter_id);

create or replace function public.block_community_user(_blocked_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or _blocked_id is null or _blocked_id = auth.uid() then
    raise exception 'invalid block target';
  end if;

  insert into public.community_user_blocks(blocker_id, blocked_id)
  values (auth.uid(), _blocked_id)
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.block_community_user(uuid) to authenticated;

create or replace function public.report_community_content(
  _post_id uuid default null,
  _comment_id uuid default null,
  _reason text default 'outro'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or ((_post_id is null) = (_comment_id is null)) then
    raise exception 'invalid report target';
  end if;

  if _post_id is not null and not exists (
    select 1 from public.community_posts where id = _post_id
  ) then
    raise exception 'post not found';
  end if;

  if _comment_id is not null and not exists (
    select 1 from public.community_comments where id = _comment_id
  ) then
    raise exception 'comment not found';
  end if;

  insert into public.community_reports(reporter_id, post_id, comment_id, reason)
  values (auth.uid(), _post_id, _comment_id, left(coalesce(nullif(trim(_reason), ''), 'outro'), 500))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.report_community_content(uuid, uuid, text) to authenticated;

create or replace function public.community_feed(_limit integer default 100)
returns table(
  id uuid,
  user_id uuid,
  author_name text,
  category text,
  region text,
  text text,
  created_at timestamptz,
  likes_count integer,
  comments_count integer,
  liked boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.author_name,
    p.category,
    p.region,
    p.text,
    p.created_at,
    coalesce(l.cnt, 0)::int as likes_count,
    coalesce(c.cnt, 0)::int as comments_count,
    exists (
      select 1 from public.community_likes ml
      where ml.post_id = p.id and ml.user_id = auth.uid()
    ) as liked
  from public.community_posts p
  left join lateral (
    select count(*)::int as cnt from public.community_likes cl where cl.post_id = p.id
  ) l on true
  left join lateral (
    select count(*)::int as cnt from public.community_comments cc where cc.post_id = p.id
  ) c on true
  where not exists (
    select 1
    from public.community_user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
       or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
  )
  order by p.created_at desc
  limit greatest(_limit, 1)
$$;

grant execute on function public.community_feed(integer) to authenticated;

create or replace function public.prepare_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Remove records that are directly owned by the account where the schema
  -- exposes a user_id/owner_id relationship. Foreign-key cascades handle the
  -- remaining dependent records.
  delete from public.community_reports where reporter_id = uid;
  delete from public.community_user_blocks where blocker_id = uid or blocked_id = uid;
  delete from public.community_likes where user_id = uid;
  delete from public.community_comments where user_id = uid;
  delete from public.community_posts where user_id = uid;

  if to_regclass('public.location_shares') is not null then
    execute 'delete from public.location_shares where owner_id = $1' using uid;
  end if;

  if to_regclass('public.emergency_contacts') is not null then
    execute 'delete from public.emergency_contacts where user_id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where id = $1' using uid;
  end if;

  return true;
end;
$$;

grant execute on function public.prepare_my_account_deletion() to authenticated;
