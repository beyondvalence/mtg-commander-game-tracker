alter table public.profiles
add column if not exists player_id uuid references public.players(id) on delete set null;

create index if not exists idx_profiles_player_id on public.profiles(player_id);
