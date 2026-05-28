-- Fix race condition in demote_pod_member: two concurrent demotes could both
-- pass the admin-count check and both succeed, leaving the pod with no admins.
-- Fix: acquire a transaction-scoped advisory lock keyed on the pod_id before
-- reading the count, serializing all demote operations for the same pod.

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

  -- Serialize concurrent demotes for this pod via advisory lock
  perform pg_advisory_xact_lock(abs(hashtext(p_pod_id::text)));

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

revoke all on function public.demote_pod_member(uuid, uuid) from anon, public;
grant execute on function public.demote_pod_member(uuid, uuid) to authenticated;
