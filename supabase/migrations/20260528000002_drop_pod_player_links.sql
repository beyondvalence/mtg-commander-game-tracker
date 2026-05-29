-- Phase B: drop pod_player_links table
--
-- pod_player_links(pod_id, user_id) → player_id is now fully derivable via:
--   SELECT id FROM players WHERE linked_user_id = <user_id>
-- No TypeScript code reads from this table directly. Three RPCs wrote to it:
-- create_pod, join_pod (inserts) and kick_pod_member (delete). Remove those
-- operations, then drop the table.

-- ── 1. Update create_pod: remove pod_player_links insert ─────────────────────
create or replace function public.create_pod(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_pod_id  uuid;
  v_enabled boolean;
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

  return v_pod_id;
end;
$$;

revoke all on function public.create_pod(text) from anon, public;
grant execute on function public.create_pod(text) to authenticated;

-- ── 2. Update join_pod: remove pod_player_links insert ───────────────────────
create or replace function public.join_pod(p_invite_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_pod_id  uuid;
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

  return v_pod_id;
end;
$$;

revoke all on function public.join_pod(uuid) from anon, public;
grant execute on function public.join_pod(uuid) to authenticated;

-- ── 3. Update kick_pod_member: remove pod_player_links delete ────────────────
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

  delete from public.pod_members
  where pod_id = p_pod_id and user_id = p_target_user_id;
end;
$$;

revoke all on function public.kick_pod_member(uuid, uuid) from anon, public;
grant execute on function public.kick_pod_member(uuid, uuid) to authenticated;

-- ── 4. Drop the table (CASCADE removes indexes and RLS policies) ──────────────
drop table if exists public.pod_player_links cascade;
