-- CHECKPOINT RC7 — conta, moderação, privacidade e interrupção de compartilhamento
-- Este checkpoint fecha lacunas de produto identificadas antes da publicação.

-- ---------------------------------------------------------------------------
-- Comunidade: denúncia e bloqueio
-- ---------------------------------------------------------------------------
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'outro',
  created_at timestamptz not null default now(),
  constraint community_reports_target_check check (
    (post_id is not null)::int + (comment_id is not null)::int = 1
  )
);

create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint community_blocks_not_self check (blocker_id <> blocked_id)
);

grant select, insert on public.community_reports to authenticated;
grant select, insert, delete on public.community_blocks to authenticated;
grant all on public.community_reports to service_role;
grant all on public.community_blocks to service_role;

alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;

drop policy if exists community_reports_insert on public.community_reports;
create policy community_reports_insert on public.community_reports
for insert to authenticated
with check (auth.uid() = reporter_id and reporter_id <> reported_user_id);

drop policy if exists community_reports_select_own on public.community_reports;
create policy community_reports_select_own on public.community_reports
for select to authenticated
using (auth.uid() = reporter_id);

drop policy if exists community_blocks_select_own on public.community_blocks;
create policy community_blocks_select_own on public.community_blocks
for select to authenticated
using (auth.uid() = blocker_id);

drop policy if exists community_blocks_insert_own on public.community_blocks;
create policy community_blocks_insert_own on public.community_blocks
for insert to authenticated
with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists community_blocks_delete_own on public.community_blocks;
create policy community_blocks_delete_own on public.community_blocks
for delete to authenticated
using (auth.uid() = blocker_id);

create index if not exists community_blocks_blocker_idx on public.community_blocks(blocker_id);
create index if not exists community_blocks_blocked_idx on public.community_blocks(blocked_id);
create index if not exists community_reports_created_idx on public.community_reports(created_at desc);

-- Helper usada pelo feed e pelas RLS. Não expõe dados privados.
create or replace function public.community_is_blocked(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_blocks b
    where (b.blocker_id = _a and b.blocked_id = _b)
       or (b.blocker_id = _b and b.blocked_id = _a)
  );
$$;

revoke all on function public.community_is_blocked(uuid, uuid) from public, anon;
grant execute on function public.community_is_blocked(uuid, uuid) to authenticated, service_role;

-- Denúncia atômica: o servidor recebe apenas um alvo existente.
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
  _reporter uuid := auth.uid();
  _reported uuid;
  _report_id uuid;
begin
  if _reporter is null then raise exception 'not_authenticated'; end if;
  if ((_post_id is null)::int + (_comment_id is null)::int) <> 1 then
    raise exception 'invalid_target';
  end if;

  if _post_id is not null then
    select p.user_id into _reported from public.community_posts p where p.id = _post_id;
  else
    select c.user_id into _reported from public.community_comments c where c.id = _comment_id;
  end if;

  if _reported is null or _reported = _reporter then raise exception 'invalid_target'; end if;

  insert into public.community_reports(reporter_id, post_id, comment_id, reported_user_id, reason)
  values (_reporter, _post_id, _comment_id, _reported, left(coalesce(nullif(trim(_reason), ''), 'outro'), 120))
  returning id into _report_id;

  return _report_id;
end;
$$;

revoke all on function public.report_community_content(uuid, uuid, text) from public, anon;
grant execute on function public.report_community_content(uuid, uuid, text) to authenticated;

create or replace function public.block_community_user(_blocked_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare _blocker uuid := auth.uid();
begin
  if _blocker is null or _blocked_id is null or _blocker = _blocked_id then
    raise exception 'invalid_target';
  end if;
  insert into public.community_blocks(blocker_id, blocked_id)
  values (_blocker, _blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

revoke all on function public.block_community_user(uuid) from public, anon;
grant execute on function public.block_community_user(uuid) to authenticated;

-- Feed: bloqueio é bilateral para que nenhum dos dois veja o conteúdo do outro.
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
  where not public.community_is_blocked(auth.uid(), p.user_id)
  order by p.created_at desc
  limit greatest(_limit, 1);
$$;
grant execute on function public.community_feed(integer) to authenticated;

-- Comentários e curtidas de conteúdo bloqueado deixam de ser legíveis/criáveis.
drop policy if exists cp_select on public.community_posts;
create policy cp_select on public.community_posts
for select to authenticated
using (not public.community_is_blocked(auth.uid(), user_id));

drop policy if exists cl_select on public.community_likes;
create policy cl_select on public.community_likes
for select to authenticated
using (
  exists (
    select 1 from public.community_posts p
    where p.id = post_id and not public.community_is_blocked(auth.uid(), p.user_id)
  )
);

drop policy if exists cl_insert on public.community_likes;
create policy cl_insert on public.community_likes
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and not public.community_is_blocked(auth.uid(), p.user_id)
  )
);

drop policy if exists cc_select on public.community_comments;
create policy cc_select on public.community_comments
for select to authenticated
using (
  exists (
    select 1 from public.community_posts p
    where p.id = post_id and not public.community_is_blocked(auth.uid(), p.user_id)
  )
  and not public.community_is_blocked(auth.uid(), user_id)
);

drop policy if exists cc_insert on public.community_comments;
create policy cc_insert on public.community_comments
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and not public.community_is_blocked(auth.uid(), p.user_id)
  )
  and not public.community_is_blocked(auth.uid(), (select p.user_id from public.community_posts p where p.id = post_id))
);

-- ---------------------------------------------------------------------------
-- Conta: limpeza dos dados do usuário antes do auth.admin.deleteUser().
-- ---------------------------------------------------------------------------
create or replace function public.prepare_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not_authenticated'; end if;

  -- Filhos de SOS primeiro, para respeitar FKs de histórico/entrega.
  delete from public.sos_delivery_receipts
  where provider_message_id in (
    select wn.provider_message_id
    from public.whatsapp_notifications wn
    where wn.sos_event_id in (select id from public.sos_events where user_id = _uid)
      and wn.provider_message_id is not null
  );
  delete from public.whatsapp_notifications
  where sos_event_id in (select id from public.sos_events where user_id = _uid);
  delete from public.community_alerts where user_id = _uid;
  delete from public.sos_events where user_id = _uid;

  delete from public.community_likes where user_id = _uid;
  delete from public.community_comments where user_id = _uid;
  delete from public.community_comments
  where post_id in (select id from public.community_posts where user_id = _uid);
  delete from public.community_reports where reporter_id = _uid or reported_user_id = _uid;
  delete from public.community_blocks where blocker_id = _uid or blocked_id = _uid;
  delete from public.community_posts where user_id = _uid;

  delete from public.location_shares where owner_id = _uid or viewer_id = _uid;
  delete from public.live_locations where user_id = _uid;
  delete from public.native_protection_sessions where user_id = _uid;
  delete from public.trips where user_id = _uid;
  delete from public.emergency_contacts where user_id = _uid;
  delete from public.user_roles where user_id = _uid;
  delete from public.profiles where id = _uid;

  return true;
end;
$$;

revoke all on function public.prepare_my_account_deletion() from public, anon;
grant execute on function public.prepare_my_account_deletion() to authenticated;
