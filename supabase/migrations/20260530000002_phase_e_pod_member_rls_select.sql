-- Phase E: allow pod members to read each other's players and profiles rows.
--
-- Root cause: getPodMembers nested join (profiles → players) was silently
-- returning null for non-self members because:
--   - players RLS: only auth.uid() = user_id OR auth.uid() = linked_user_id
--   - profiles RLS: only auth.uid() = id
-- Neither table had a pod-scoped SELECT policy, so the PostgREST nested join
-- resolved to null for every peer, making displayName always null and the
-- "Display name not set" warning fire unconditionally for all non-self members.
--
-- Fix: add a SECURITY DEFINER helper shares_pod(user_a, user_b) and two
-- additional FOR SELECT policies. The existing FOR ALL ownership policies are
-- untouched — new policies add read access via OR (permissive mode).

-- ── Helper: do two users share any pod? ──────────────────────────────────────

create or replace function public.shares_pod(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pod_members pm1
    join public.pod_members pm2 on pm1.pod_id = pm2.pod_id
    where pm1.user_id = p_user_a and pm2.user_id = p_user_b
  );
$$;

revoke all on function public.shares_pod(uuid, uuid) from anon, public;
grant execute on function public.shares_pod(uuid, uuid) to authenticated;

-- ── players: pod-scoped SELECT ────────────────────────────────────────────────
-- Allow a user to SELECT another player row when that player is linked to
-- someone who shares a pod with the current user.

drop policy if exists "players_pod_member_select" on public.players;
create policy "players_pod_member_select" on public.players
  for select to authenticated
  using (
    linked_user_id is not null
    and public.shares_pod((select auth.uid()), players.linked_user_id)
  );

-- ── profiles: pod-scoped SELECT ───────────────────────────────────────────────
-- Allow a user to SELECT another profile row when the profile owner shares a
-- pod with the current user. This unblocks getPodMembers email join.

drop policy if exists "profiles_pod_member_select" on public.profiles;
create policy "profiles_pod_member_select" on public.profiles
  for select to authenticated
  using (
    public.shares_pod((select auth.uid()), profiles.id)
  );
