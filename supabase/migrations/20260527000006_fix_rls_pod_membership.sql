-- Fix RLS infinite recursion caused by pod_members policies that self-reference
-- the pod_members table. The pattern:
--
--   games_pod_member_select → EXISTS (SELECT FROM pod_members)
--   pod_members.rls → EXISTS (SELECT FROM pod_members pm2 ...)  ← recursion
--
-- Solution: two SECURITY DEFINER helper functions that read pod_members without
-- triggering RLS, then all policies call these functions instead of raw EXISTS.

-- ─── Helper functions ──────────────────────────────────────────────────────────

create or replace function public.is_pod_member(p_pod_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pod_members pm
    where pm.pod_id = p_pod_id and pm.user_id = p_user_id
  );
$$;

create or replace function public.is_pod_admin(p_pod_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pod_members pm
    where pm.pod_id = p_pod_id and pm.user_id = p_user_id and pm.role = 'admin'
  );
$$;

revoke all on function public.is_pod_member(uuid, uuid) from anon, public;
revoke all on function public.is_pod_admin(uuid, uuid) from anon, public;
grant execute on function public.is_pod_member(uuid, uuid) to authenticated;
grant execute on function public.is_pod_admin(uuid, uuid) to authenticated;

-- ─── Rebuild pods RLS ──────────────────────────────────────────────────────────

drop policy if exists "pods_select" on public.pods;
create policy "pods_select" on public.pods
  for select to authenticated
  using (public.is_pod_member(pods.id, (select auth.uid())));

drop policy if exists "pods_update" on public.pods;
create policy "pods_update" on public.pods
  for update to authenticated
  using (public.is_pod_admin(pods.id, (select auth.uid())));

-- ─── Rebuild pod_members RLS ───────────────────────────────────────────────────

drop policy if exists "pod_members_select" on public.pod_members;
create policy "pod_members_select" on public.pod_members
  for select to authenticated
  using (public.is_pod_member(pod_members.pod_id, (select auth.uid())));

drop policy if exists "pod_members_update" on public.pod_members;
create policy "pod_members_update" on public.pod_members
  for update to authenticated
  using (public.is_pod_admin(pod_members.pod_id, (select auth.uid())));

drop policy if exists "pod_members_delete" on public.pod_members;
create policy "pod_members_delete" on public.pod_members
  for delete to authenticated
  using (
    pod_members.user_id = (select auth.uid())
    or public.is_pod_admin(pod_members.pod_id, (select auth.uid()))
  );

-- ─── Rebuild pod_player_links RLS ─────────────────────────────────────────────

drop policy if exists "pod_player_links_select" on public.pod_player_links;
create policy "pod_player_links_select" on public.pod_player_links
  for select to authenticated
  using (public.is_pod_member(pod_player_links.pod_id, (select auth.uid())));

-- ─── Rebuild games pod-member SELECT policy ────────────────────────────────────

drop policy if exists "games_pod_member_select" on public.games;
create policy "games_pod_member_select" on public.games
  for select to authenticated
  using (
    pod_id is not null
    and public.is_pod_member(games.pod_id, (select auth.uid()))
  );

-- ─── Rebuild game_participants pod-member SELECT policy ────────────────────────

drop policy if exists "game_participants_pod_member_select" on public.game_participants;
create policy "game_participants_pod_member_select" on public.game_participants
  for select to authenticated
  using (
    pod_id is not null
    and public.is_pod_member(game_participants.pod_id, (select auth.uid()))
  );
