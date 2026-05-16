-- MTG Commander Tracker Supabase Schema
-- Run this in the Supabase SQL editor.
-- This version is set up for a single-user browser client with no in-app login.

create extension if not exists "pgcrypto";

-- Updated timestamp helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Remove auth-specific setup from earlier versions of the app.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles cascade;

-- Players
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players drop constraint if exists players_user_name_unique;
alter table public.players drop column if exists user_id cascade;
alter table public.players add constraint players_name_unique unique (name);

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

-- Commanders
create table if not exists public.commanders (
  id uuid primary key default gen_random_uuid(),
  scryfall_id text,
  name text not null,
  image_url text,
  color_identity text[] not null default '{}',
  type_line text,
  oracle_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commanders drop constraint if exists commanders_user_scryfall_unique;
alter table public.commanders drop column if exists user_id cascade;
alter table public.commanders add constraint commanders_scryfall_unique unique (scryfall_id);

drop trigger if exists set_commanders_updated_at on public.commanders;
create trigger set_commanders_updated_at
before update on public.commanders
for each row execute function public.set_updated_at();

-- Games
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text,
  played_at date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  number_of_players integer not null default 4 check (number_of_players >= 2),
  bracket integer not null default 3 check (bracket >= 1 and bracket <= 5),
  winner_player_id uuid references public.players(id),
  winner_participant_id uuid,
  win_condition text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games drop column if exists user_id cascade;
alter table public.games add column if not exists title text;
alter table public.games add column if not exists bracket integer not null default 3;
alter table public.games drop constraint if exists games_bracket_check;
alter table public.games add constraint games_bracket_check check (bracket >= 1 and bracket <= 5);

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
before update on public.games
for each row execute function public.set_updated_at();

-- Game Participants
create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
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

alter table public.game_participants drop column if exists user_id cascade;

drop trigger if exists set_game_participants_updated_at on public.game_participants;
create trigger set_game_participants_updated_at
before update on public.game_participants
for each row execute function public.set_updated_at();

alter table public.games
drop constraint if exists games_winner_participant_fk;

alter table public.games
add constraint games_winner_participant_fk
foreign key (winner_participant_id)
references public.game_participants(id)
on delete set null;

create unique index if not exists idx_game_participants_one_winner_per_game
on public.game_participants (game_id)
where is_winner;

create or replace function public.enforce_game_winner_consistency()
returns trigger as $$
declare
  v_game_id uuid;
  v_winner_participant_id uuid;
  v_winner_player_id uuid;
  v_marked_winner_count integer;
begin
  if tg_table_name = 'games' then
    v_game_id := coalesce(new.id, old.id);
  else
    v_game_id := coalesce(new.game_id, old.game_id);
  end if;

  select g.winner_participant_id, g.winner_player_id
    into v_winner_participant_id, v_winner_player_id
  from public.games g
  where g.id = v_game_id;

  if v_winner_participant_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.id = v_winner_participant_id
      and gp.game_id = v_game_id
  ) then
    raise exception 'winner_participant_id % must belong to game %', v_winner_participant_id, v_game_id;
  end if;

  select count(*)
    into v_marked_winner_count
  from public.game_participants gp
  where gp.game_id = v_game_id
    and gp.is_winner = true;

  if v_marked_winner_count <> 1 then
    raise exception 'game % must have exactly one game_participants.is_winner = true row', v_game_id;
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = v_game_id
      and gp.id = v_winner_participant_id
      and gp.is_winner = true
  ) then
    raise exception 'winner_participant_id % for game % must be marked is_winner = true', v_winner_participant_id, v_game_id;
  end if;

  if v_winner_player_id is not null and not exists (
    select 1
    from public.game_participants gp
    where gp.id = v_winner_participant_id
      and gp.player_id = v_winner_player_id
  ) then
    raise exception 'games.winner_player_id must match winner participant player_id for game %', v_game_id;
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_game_winner_consistency_from_games on public.games;
create constraint trigger trg_enforce_game_winner_consistency_from_games
after insert or update of winner_participant_id, winner_player_id on public.games
deferrable initially deferred
for each row execute function public.enforce_game_winner_consistency();

drop trigger if exists trg_enforce_game_winner_consistency_from_participants on public.game_participants;
create constraint trigger trg_enforce_game_winner_consistency_from_participants
after insert or update of is_winner, game_id, player_id or delete on public.game_participants
deferrable initially deferred
for each row execute function public.enforce_game_winner_consistency();

create or replace function public.set_game_winner(
  p_game_id uuid,
  p_winner_participant_id uuid default null
)
returns void
language plpgsql
as $$
declare
  v_winner_player_id uuid;
begin
  if p_winner_participant_id is not null then
    select gp.player_id
      into v_winner_player_id
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.id = p_winner_participant_id;
  end if;

  update public.game_participants
  set is_winner = false
  where game_id = p_game_id
    and is_winner = true;

  if p_winner_participant_id is not null then
    update public.game_participants
    set is_winner = true
    where game_id = p_game_id
      and id = p_winner_participant_id;
  end if;

  update public.games
  set winner_participant_id = p_winner_participant_id,
      winner_player_id = v_winner_player_id
  where id = p_game_id;
end;
$$;

-- Indexes
create index if not exists idx_games_played_at on public.games(played_at);
create index if not exists idx_game_participants_game_id on public.game_participants(game_id);

-- Data API grants
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.players to anon, authenticated;
grant select, insert, update, delete on table public.commanders to anon, authenticated;
grant select, insert, update, delete on table public.games to anon, authenticated;
grant select, insert, update, delete on table public.game_participants to anon, authenticated;
grant execute on function public.set_game_winner(uuid, uuid) to anon, authenticated;

-- Row Level Security
alter table public.players enable row level security;
alter table public.commanders enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;

drop policy if exists "Users can view own players" on public.players;
drop policy if exists "Users can insert own players" on public.players;
drop policy if exists "Users can update own players" on public.players;
drop policy if exists "Users can delete own players" on public.players;
drop policy if exists "Single user can manage players" on public.players;
create policy "Single user can manage players"
on public.players
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Users can view own commanders" on public.commanders;
drop policy if exists "Users can insert own commanders" on public.commanders;
drop policy if exists "Users can update own commanders" on public.commanders;
drop policy if exists "Users can delete own commanders" on public.commanders;
drop policy if exists "Single user can manage commanders" on public.commanders;
create policy "Single user can manage commanders"
on public.commanders
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Users can view own games" on public.games;
drop policy if exists "Users can insert own games" on public.games;
drop policy if exists "Users can update own games" on public.games;
drop policy if exists "Users can delete own games" on public.games;
drop policy if exists "Single user can manage games" on public.games;
create policy "Single user can manage games"
on public.games
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Users can view own game participants" on public.game_participants;
drop policy if exists "Users can insert own game participants" on public.game_participants;
drop policy if exists "Users can update own game participants" on public.game_participants;
drop policy if exists "Users can delete own game participants" on public.game_participants;
drop policy if exists "Single user can manage game participants" on public.game_participants;
create policy "Single user can manage game participants"
on public.game_participants
for all
to anon, authenticated
using (true)
with check (true);
