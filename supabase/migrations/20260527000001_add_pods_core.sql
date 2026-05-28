-- ─── app_config ───────────────────────────────────────────────────────────────

create table if not exists public.app_config (
  key   text primary key,
  value jsonb not null
);

insert into public.app_config(key, value)
values ('pod_creation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "app_config_select" on public.app_config;
create policy "app_config_select" on public.app_config
  for select to authenticated using (true);

grant select on table public.app_config to authenticated;

-- ─── pods ──────────────────────────────────────────────────────────────────────
-- RLS policies that reference pod_members are added after pod_members is created.

create table if not exists public.pods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code uuid not null unique default gen_random_uuid(),
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_pods_invite_code on public.pods(invite_code);
create index if not exists idx_pods_created_by  on public.pods(created_by);

alter table public.pods enable row level security;

-- ─── pod_members ───────────────────────────────────────────────────────────────

create table if not exists public.pod_members (
  pod_id    uuid not null references public.pods(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);

create index if not exists idx_pod_members_pod_id  on public.pod_members(pod_id);
create index if not exists idx_pod_members_user_id on public.pod_members(user_id);

alter table public.pod_members enable row level security;

-- ─── pods RLS (added after pod_members exists) ─────────────────────────────────

drop policy if exists "pods_select" on public.pods;
create policy "pods_select" on public.pods
  for select to authenticated
  using (
    exists (
      select 1 from public.pod_members pm
      where pm.pod_id = pods.id and pm.user_id = (select auth.uid())
    )
  );

drop policy if exists "pods_insert" on public.pods;
create policy "pods_insert" on public.pods
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

drop policy if exists "pods_update" on public.pods;
create policy "pods_update" on public.pods
  for update to authenticated
  using (
    exists (
      select 1 from public.pod_members pm
      where pm.pod_id = pods.id and pm.user_id = (select auth.uid()) and pm.role = 'admin'
    )
  );

grant select, insert, update on table public.pods to authenticated;

-- ─── pod_members RLS ───────────────────────────────────────────────────────────

drop policy if exists "pod_members_select" on public.pod_members;
create policy "pod_members_select" on public.pod_members
  for select to authenticated
  using (
    exists (
      select 1 from public.pod_members pm2
      where pm2.pod_id = pod_members.pod_id and pm2.user_id = (select auth.uid())
    )
  );

drop policy if exists "pod_members_update" on public.pod_members;
create policy "pod_members_update" on public.pod_members
  for update to authenticated
  using (
    exists (
      select 1 from public.pod_members pm2
      where pm2.pod_id = pod_members.pod_id and pm2.user_id = (select auth.uid()) and pm2.role = 'admin'
    )
  );

drop policy if exists "pod_members_delete" on public.pod_members;
create policy "pod_members_delete" on public.pod_members
  for delete to authenticated
  using (
    pod_members.user_id = (select auth.uid())
    or exists (
      select 1 from public.pod_members pm2
      where pm2.pod_id = pod_members.pod_id and pm2.user_id = (select auth.uid()) and pm2.role = 'admin'
    )
  );

grant select, insert, update, delete on table public.pod_members to authenticated;

-- ─── pod_player_links ──────────────────────────────────────────────────────────

create table if not exists public.pod_player_links (
  pod_id    uuid not null references public.pods(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (pod_id, user_id)
);

create index if not exists idx_pod_player_links_pod  on public.pod_player_links(pod_id);
create index if not exists idx_pod_player_links_user on public.pod_player_links(user_id);

alter table public.pod_player_links enable row level security;

drop policy if exists "pod_player_links_select" on public.pod_player_links;
create policy "pod_player_links_select" on public.pod_player_links
  for select to authenticated
  using (
    exists (
      select 1 from public.pod_members pm
      where pm.pod_id = pod_player_links.pod_id and pm.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on table public.pod_player_links to authenticated;

-- ─── user_commanders ───────────────────────────────────────────────────────────

create table if not exists public.user_commanders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  scryfall_id    text,
  name           text not null,
  image_url      text,
  color_identity text[] not null default '{}',
  added_at       timestamptz not null default now()
);

create unique index if not exists idx_user_commanders_user_scryfall
  on public.user_commanders(user_id, scryfall_id)
  where scryfall_id is not null;

create index if not exists idx_user_commanders_user_id on public.user_commanders(user_id);

alter table public.user_commanders enable row level security;

drop policy if exists "user_commanders_all" on public.user_commanders;
create policy "user_commanders_all" on public.user_commanders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.user_commanders to authenticated;

-- ─── RPCs ──────────────────────────────────────────────────────────────────────

create or replace function public.create_pod(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_pod_id    uuid;
  v_enabled   boolean;
  v_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'create_pod requires an authenticated user';
  end if;

  select (value::text)::boolean
    into v_enabled
  from public.app_config
  where key = 'pod_creation_enabled';

  if not coalesce(v_enabled, true) then
    raise exception 'pod_creation_disabled';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'pod name cannot be blank';
  end if;

  insert into public.pods(name, created_by)
  values (trim(p_name), v_user_id)
  returning id into v_pod_id;

  insert into public.pod_members(pod_id, user_id, role)
  values (v_pod_id, v_user_id, 'admin');

  select player_id into v_player_id
  from public.profiles
  where id = v_user_id;

  if v_player_id is not null then
    insert into public.pod_player_links(pod_id, user_id, player_id)
    values (v_pod_id, v_user_id, v_player_id)
    on conflict (pod_id, user_id) do nothing;
  end if;

  return v_pod_id;
end;
$$;

create or replace function public.join_pod(p_invite_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_pod_id    uuid;
  v_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'join_pod requires an authenticated user';
  end if;

  select id into v_pod_id
  from public.pods
  where invite_code = p_invite_code;

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.pod_members(pod_id, user_id, role)
  values (v_pod_id, v_user_id, 'member')
  on conflict (pod_id, user_id) do nothing;

  select player_id into v_player_id
  from public.profiles
  where id = v_user_id;

  if v_player_id is not null then
    insert into public.pod_player_links(pod_id, user_id, player_id)
    values (v_pod_id, v_user_id, v_player_id)
    on conflict (pod_id, user_id) do nothing;
  end if;

  return v_pod_id;
end;
$$;

create or replace function public.kick_pod_member(p_pod_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'kick_pod_member requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.pod_members
    where pod_id = p_pod_id and user_id = v_user_id and role = 'admin'
  ) then
    raise exception 'not_pod_admin';
  end if;

  if v_user_id = p_target_user_id then
    raise exception 'cannot_kick_self';
  end if;

  delete from public.pod_player_links
  where pod_id = p_pod_id and user_id = p_target_user_id;

  delete from public.pod_members
  where pod_id = p_pod_id and user_id = p_target_user_id;
end;
$$;

create or replace function public.promote_pod_member(p_pod_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'promote_pod_member requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.pod_members
    where pod_id = p_pod_id and user_id = v_user_id and role = 'admin'
  ) then
    raise exception 'not_pod_admin';
  end if;

  update public.pod_members
  set role = 'admin'
  where pod_id = p_pod_id and user_id = p_target_user_id;

  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

create or replace function public.demote_pod_member(p_pod_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_admin_count integer;
begin
  if v_user_id is null then
    raise exception 'demote_pod_member requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.pod_members
    where pod_id = p_pod_id and user_id = v_user_id and role = 'admin'
  ) then
    raise exception 'not_pod_admin';
  end if;

  select count(*) into v_admin_count
  from public.pod_members
  where pod_id = p_pod_id and role = 'admin';

  if v_admin_count <= 1 then
    raise exception 'cannot_demote_last_admin';
  end if;

  update public.pod_members
  set role = 'member'
  where pod_id = p_pod_id and user_id = p_target_user_id;

  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

create or replace function public.get_user_pods()
returns table(
  pod_id      uuid,
  pod_name    text,
  role        text,
  invite_code text,
  member_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    pm.role,
    case when pm.role = 'admin' then p.invite_code::text else null end,
    (select count(*) from public.pod_members pm2 where pm2.pod_id = p.id)
  from public.pods p
  join public.pod_members pm on pm.pod_id = p.id and pm.user_id = auth.uid()
  order by pm.joined_at asc;
$$;

revoke all on function public.create_pod(text) from anon, public;
revoke all on function public.join_pod(uuid) from anon, public;
revoke all on function public.kick_pod_member(uuid, uuid) from anon, public;
revoke all on function public.promote_pod_member(uuid, uuid) from anon, public;
revoke all on function public.demote_pod_member(uuid, uuid) from anon, public;
revoke all on function public.get_user_pods() from anon, public;

grant execute on function public.create_pod(text) to authenticated;
grant execute on function public.join_pod(uuid) to authenticated;
grant execute on function public.kick_pod_member(uuid, uuid) to authenticated;
grant execute on function public.promote_pod_member(uuid, uuid) to authenticated;
grant execute on function public.demote_pod_member(uuid, uuid) to authenticated;
grant execute on function public.get_user_pods() to authenticated;
