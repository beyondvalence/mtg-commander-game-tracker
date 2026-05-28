-- Add FK from pod_members.user_id → profiles(id) so PostgREST can join
-- pod_members → profiles for email lookup.
-- profiles.id is itself a FK to auth.users(id), so this is always valid
-- (new-user trigger creates the profile before any pod operations can occur).

alter table public.pod_members
  add constraint pod_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
