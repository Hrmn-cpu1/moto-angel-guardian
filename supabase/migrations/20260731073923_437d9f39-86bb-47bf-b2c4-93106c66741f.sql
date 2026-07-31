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
  order by p.created_at desc
  limit greatest(_limit, 1)
$$;

grant execute on function public.community_feed(integer) to authenticated;

create index if not exists community_likes_post_id_idx on public.community_likes(post_id);
create index if not exists community_comments_post_id_idx on public.community_comments(post_id);
create index if not exists community_posts_created_at_idx on public.community_posts(created_at desc);