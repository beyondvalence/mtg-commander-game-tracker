-- MTG Commander Tracker Supabase Schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Updated timestamp helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Players
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_user_name_unique unique (user_id, name)
);

create trigger set_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

-- Commanders
create table if not exists public.commanders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id text,
  name text not null,
  image_url text,
  color_identity text[] not null default '{}',
  type_line text,
  oracle_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commanders_user_scryfall_unique unique (user_id, scryfall_id)
);

create trigger set_commanders_updated_at
before update on public.commanders
for each row execute function public.set_updated_at();

-- Games
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  played_at date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  number_of_players integer not null default 4 check (number_of_players >= 2),
  winner_player_id uuid references public.players(id),
  winner_participant_id uuid,
  win_condition text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_games_updated_at
before update on public.games
for each row execute function public.set_updated_at();

-- Game Participants
create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id),
  turn_order_position integer not null check (turn_order_position > 0),
  primary_commander_id uuid not null references public.commanders(id),
  secondary_commander_id uuid references public.commanders(id),
  is_winner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_participants_game_turn_unique unique (game_id, turn_order_position),
  constraint game_participants_game_player_unique unique (game_id, player_id)
);

create trigger set_game_participants_updated_at
before update on public.game_participants
for each row execute function public.set_updated_at();

alter table public.games
add constraint games_winner_participant_fk
foreign key (winner_participant_id)
references public.game_participants(id)
on delete set null;

-- Indexes
create index if not exists idx_players_user_id on public.players(user_id);
create index if not exists idx_commanders_user_id on public.commanders(user_id);
create index if not exists idx_games_user_id on public.games(user_id);
create index if not exists idx_games_played_at on public.games(played_at);
create index if not exists idx_game_participants_user_id on public.game_participants(user_id);
create index if not exists idx_game_participants_game_id on public.game_participants(game_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.commanders enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;

-- Profiles policies
create policy "Users can view own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Players policies
create policy "Users can view own players"
on public.players for select
using (auth.uid() = user_id);

create policy "Users can insert own players"
on public.players for insert
with check (auth.uid() = user_id);

create policy "Users can update own players"
on public.players for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own players"
on public.players for delete
using (auth.uid() = user_id);

-- Commanders policies
create policy "Users can view own commanders"
on public.commanders for select
using (auth.uid() = user_id);

create policy "Users can insert own commanders"
on public.commanders for insert
with check (auth.uid() = user_id);

create policy "Users can update own commanders"
on public.commanders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own commanders"
on public.commanders for delete
using (auth.uid() = user_id);

-- Games policies
create policy "Users can view own games"
on public.games for select
using (auth.uid() = user_id);

create policy "Users can insert own games"
on public.games for insert
with check (auth.uid() = user_id);

create policy "Users can update own games"
on public.games for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own games"
on public.games for delete
using (auth.uid() = user_id);

-- Game participants policies
create policy "Users can view own game participants"
on public.game_participants for select
using (auth.uid() = user_id);

create policy "Users can insert own game participants"
on public.game_participants for insert
with check (auth.uid() = user_id);

create policy "Users can update own game participants"
on public.game_participants for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own game participants"
on public.game_participants for delete
using (auth.uid() = user_id);

-- Optional: create profile automatically on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
