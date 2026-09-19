-- CHECKPOINT RC9 — reconciliacao das migrations RC7 duplicadas
-- O repositorio possui dois arquivos RC7 que criavam tabelas/funcoes
-- sobrepostas. Esta migration deixa o banco com um unico contrato efetivo.

alter table public.community_reports
  add column if not exists reported_user_id uuid references auth.users(id) on delete cascade;

alter table public.community_reports
  add column if not exists status text not null default 'open';

alter table public.community_reports
  drop constraint if exists community_reports_status_check;

alter table public.community_reports
  add constraint community_reports_status_check
  check (status in ('open','reviewed','dismissed'));

-- Reconstrói o alvo do relatório a partir do conteúdo antes de exigir a coluna.
update public.community_reports r
set reported_user_id = p.user_id
from public.community_posts p
where r.reported_user_id is null
  and r.post_id = p.id;

update public.community_reports r
set reported_user_id = c.user_id
from public.community_comments c
where r.reported_user_id is null
  and r.comment_id = c.id;

delete from public.community_reports
where reported_user_id is null;

alter table public.community_reports
  alter column reported_user_id set not null;

create index if not exists community_reports_status_idx
  on public.community_reports(status, created_at desc);

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
  v_reporter uuid := auth.uid();
  v_reported uuid;
  v_id uuid;
begin
  if v_reporter is null then raise exception 'not_authenticated'; end if;
  if ((_post_id is null)::int + (_comment_id is null)::int) <> 1 then
    raise exception 'invalid_target';
  end if;

  if _post_id is not null then
    select p.user_id into v_reported
    from public.community_posts p
    where p.id = _post_id;
  else
    select c.user_id into v_reported
    from public.community_comments c
    where c.id = _comment_id;
  end if;

  if v_reported is null or v_reported = v_reporter then
    raise exception 'invalid_target';
  end if;

  insert into public.community_reports(
    reporter_id, post_id, comment_id, reported_user_id, reason, status
  )
  values (
    v_reporter, _post_id, _comment_id, v_reported,
    left(coalesce(nullif(trim(_reason), ''), 'outro'), 120),
    'open'
  )
  returning id into v_id;

  return v_id;
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
declare
  v_blocker uuid := auth.uid();
begin
  if v_blocker is null or _blocked_id is null or v_blocker = _blocked_id then
    raise exception 'invalid_target';
  end if;

  insert into public.community_blocks(blocker_id, blocked_id)
  values (v_blocker, _blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;

  return true;
end;
$$;

revoke all on function public.block_community_user(uuid) from public, anon;
grant execute on function public.block_community_user(uuid) to authenticated;

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
    p.id, p.user_id, p.author_name, p.category, p.region, p.text, p.created_at,
    coalesce(l.cnt, 0)::int,
    coalesce(c.cnt, 0)::int,
    exists (
      select 1 from public.community_likes ml
      where ml.post_id = p.id and ml.user_id = auth.uid()
    )
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

create or replace function public.prepare_my_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.sos_delivery_receipts
  where provider_message_id in (
    select wn.provider_message_id
    from public.whatsapp_notifications wn
    where wn.sos_event_id in (
      select id from public.sos_events where user_id = v_uid
    )
    and wn.provider_message_id is not null
  );

  delete from public.whatsapp_notifications
  where sos_event_id in (select id from public.sos_events where user_id = v_uid);

  delete from public.community_alerts where user_id = v_uid;
  delete from public.sos_events where user_id = v_uid;

  delete from public.community_likes where user_id = v_uid;
  delete from public.community_comments where user_id = v_uid;
  delete from public.community_comments
  where post_id in (select id from public.community_posts where user_id = v_uid);

  delete from public.community_reports
  where reporter_id = v_uid or reported_user_id = v_uid;

  delete from public.community_blocks
  where blocker_id = v_uid or blocked_id = v_uid;

  delete from public.community_user_blocks
  where blocker_id = v_uid or blocked_id = v_uid;

  delete from public.community_posts where user_id = v_uid;

  delete from public.location_shares
  where owner_id = v_uid or viewer_id = v_uid;

  delete from public.live_locations where user_id = v_uid;
  delete from public.native_protection_sessions where user_id = v_uid;
  delete from public.trips where user_id = v_uid;
  delete from public.emergency_contacts where user_id = v_uid;
  delete from public.user_roles where user_id = v_uid;
  delete from public.profiles where id = v_uid;

  return true;
end;
$$;

revoke all on function public.prepare_my_account_deletion() from public, anon;
grant execute on function public.prepare_my_account_deletion() to authenticated;
