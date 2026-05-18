-- MTG Commander Tracker Supabase Schema
-- Run this in the Supabase SQL editor.
-- This version is set up for a single-user browser client with no in-app login.

create extension if not exists "pgcrypto";

-- Updated timestamp helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  played_at date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  turn_length integer check (turn_length is null or turn_length > 0),
  number_of_players integer not null default 4 check (number_of_players >= 2),
  bracket integer not null default 3 check (bracket >= 1 and bracket <= 5),
  service text not null default 'Convoke',
  winner_player_id uuid references public.players(id),
  winner_participant_id uuid,
  win_condition text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games drop column if exists user_id cascade;
alter table public.games add column if not exists bracket integer not null default 3;
alter table public.games drop constraint if exists games_bracket_check;
alter table public.games add constraint games_bracket_check check (bracket >= 1 and bracket <= 5);
alter table public.games add column if not exists turn_length integer;
alter table public.games drop constraint if exists games_turn_length_check;
alter table public.games add constraint games_turn_length_check check (turn_length is null or turn_length > 0);
alter table public.games add column if not exists service text not null default 'Convoke';
alter table public.games drop constraint if exists games_service_check;
alter table public.games add constraint games_service_check check (service in ('paper', 'Convoke', 'Spelltable'));

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
returns trigger
language plpgsql
set search_path = ''
as $$
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

  select count(*)
    into v_marked_winner_count
  from public.game_participants gp
  where gp.game_id = v_game_id
    and gp.is_winner = true;

  if v_winner_participant_id is null then
    if v_marked_winner_count <> 0 then
      raise exception 'game % cannot have any game_participants.is_winner = true rows when winner_participant_id is null', v_game_id;
    end if;

    if v_winner_player_id is not null then
      raise exception 'game % cannot have winner_player_id when winner_participant_id is null', v_game_id;
    end if;

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
$$;

create or replace function public.sync_game_participant_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.game_id is distinct from new.game_id then
    update public.games
    set number_of_players = (
      select count(*)::integer
      from public.game_participants gp
      where gp.game_id = old.game_id
    )
    where id = old.game_id;
  end if;

  update public.games
  set number_of_players = (
    select count(*)::integer
    from public.game_participants gp
    where gp.game_id = case when tg_op = 'DELETE' then old.game_id else new.game_id end
  )
  where id = case when tg_op = 'DELETE' then old.game_id else new.game_id end;

  return null;
end;
$$;

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

drop trigger if exists trg_sync_game_participant_count on public.game_participants;
create trigger trg_sync_game_participant_count
after insert or update of game_id or delete on public.game_participants
for each row execute function public.sync_game_participant_count();

create or replace function public.set_game_winner(
  p_game_id uuid,
  p_winner_participant_id uuid default null
)
returns void
language plpgsql
set search_path = ''
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

drop function if exists public.create_game_with_participants(date, integer, integer, text, text, jsonb);

create or replace function public.create_game_with_participants(
  p_played_at date,
  p_number_of_players integer,
  p_bracket integer,
  p_win_condition text,
  p_service text default 'Convoke',
  p_turn_length integer default null,
  p_notes text default null,
  p_participants jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_participant jsonb;
  v_player_id uuid;
  v_primary_commander_id uuid;
  v_secondary_commander_id uuid;
  v_inserted_participant_id uuid;
  v_winner_participant_id uuid;
  v_winner_count integer := 0;
  v_participant_count integer := 0;
begin
  if p_number_of_players < 2 then
    raise exception 'number_of_players must be at least 2';
  end if;

  if jsonb_typeof(p_participants) <> 'array' then
    raise exception 'participants payload must be a json array';
  end if;

  v_participant_count := jsonb_array_length(p_participants);

  if v_participant_count <> p_number_of_players then
    raise exception 'participants payload count % must match number_of_players %', v_participant_count, p_number_of_players;
  end if;

  insert into public.games (
    played_at,
    number_of_players,
    bracket,
    service,
    turn_length,
    win_condition,
    notes
  )
  values (
    p_played_at,
    p_number_of_players,
    p_bracket,
    p_service,
    p_turn_length,
    trim(p_win_condition),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_game_id;

  for v_participant in
    select value
    from jsonb_array_elements(p_participants)
  loop
    if nullif(trim(v_participant->>'player_name'), '') is null then
      raise exception 'each participant must include a player_name';
    end if;

    if v_participant->'primary_commander' is null then
      raise exception 'each participant must include a primary_commander';
    end if;

    if (v_participant->>'seat') is null then
      raise exception 'each participant must include a seat';
    end if;

    insert into public.players (name)
    values (trim(v_participant->>'player_name'))
    on conflict (name) do update
    set name = excluded.name
    returning id into v_player_id;

    insert into public.commanders (
      scryfall_id,
      name,
      image_url,
      color_identity,
      type_line,
      oracle_text
    )
    values (
      v_participant->'primary_commander'->>'scryfall_id',
      trim(v_participant->'primary_commander'->>'name'),
      nullif(v_participant->'primary_commander'->>'image_url', ''),
      coalesce(
        array(
          select jsonb_array_elements_text(coalesce(v_participant->'primary_commander'->'color_identity', '[]'::jsonb))
        ),
        '{}'::text[]
      ),
      nullif(v_participant->'primary_commander'->>'type_line', ''),
      nullif(v_participant->'primary_commander'->>'oracle_text', '')
    )
    on conflict (scryfall_id) do update
    set name = excluded.name,
        image_url = excluded.image_url,
        color_identity = excluded.color_identity,
        type_line = excluded.type_line,
        oracle_text = excluded.oracle_text
    returning id into v_primary_commander_id;

    v_secondary_commander_id := null;

    if v_participant->'secondary_commander' is not null then
      insert into public.commanders (
        scryfall_id,
        name,
        image_url,
        color_identity,
        type_line,
        oracle_text
      )
      values (
        v_participant->'secondary_commander'->>'scryfall_id',
        trim(v_participant->'secondary_commander'->>'name'),
        nullif(v_participant->'secondary_commander'->>'image_url', ''),
        coalesce(
          array(
            select jsonb_array_elements_text(coalesce(v_participant->'secondary_commander'->'color_identity', '[]'::jsonb))
          ),
          '{}'::text[]
        ),
        nullif(v_participant->'secondary_commander'->>'type_line', ''),
        nullif(v_participant->'secondary_commander'->>'oracle_text', '')
      )
      on conflict (scryfall_id) do update
      set name = excluded.name,
          image_url = excluded.image_url,
          color_identity = excluded.color_identity,
          type_line = excluded.type_line,
          oracle_text = excluded.oracle_text
      returning id into v_secondary_commander_id;
    end if;

    insert into public.game_participants (
      game_id,
      player_id,
      turn_order_position,
      primary_commander_id,
      secondary_commander_id,
      is_winner
    )
    values (
      v_game_id,
      v_player_id,
      (v_participant->>'seat')::integer,
      v_primary_commander_id,
      v_secondary_commander_id,
      false
    )
    returning id into v_inserted_participant_id;

    if coalesce((v_participant->>'is_winner')::boolean, false) then
      v_winner_count := v_winner_count + 1;
      v_winner_participant_id := v_inserted_participant_id;
    end if;
  end loop;

  if exists (
    select 1
    from public.game_participants gp
    where gp.game_id = v_game_id
    group by gp.turn_order_position
    having count(*) > 1
  ) then
    raise exception 'participant seats must be unique per game';
  end if;

  if exists (
    select 1
    from generate_series(1, p_number_of_players) as expected_seat
    where not exists (
      select 1
      from public.game_participants gp
      where gp.game_id = v_game_id
        and gp.turn_order_position = expected_seat
    )
  ) then
    raise exception 'participant seats must be contiguous from 1 to number_of_players';
  end if;

  if v_winner_count > 1 then
    raise exception 'games may not have more than one winner';
  end if;

  perform public.set_game_winner(v_game_id, v_winner_participant_id);

  return v_game_id;
end;
$$;

-- Indexes
create index if not exists idx_games_played_at on public.games(played_at);
create index if not exists idx_game_participants_game_id on public.game_participants(game_id);

drop view if exists public.player_page_summary;
drop view if exists public.player_directory_entries;
drop view if exists public.commander_summary_entries;
drop view if exists public.dashboard_summary;
drop view if exists public.numbered_games;

create view public.numbered_games
with (security_invoker = true)
as
select
  g.id,
  g.played_at,
  g.created_at,
  g.number_of_players,
  g.bracket,
  g.service,
  g.turn_length,
  g.win_condition,
  g.notes,
  row_number() over (
    order by g.played_at asc, g.created_at asc, g.id asc
  )::integer as game_number
from public.games g;

create view public.dashboard_summary
with (security_invoker = true)
as
select
  (select count(*)::integer from public.games) as total_games,
  (select count(*)::integer from public.commanders) as total_commanders,
  (select count(*)::integer from public.players) as total_players;

create view public.commander_summary_entries
with (security_invoker = true)
as
with commander_uses as (
  select
    gp.is_winner,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.primary_commander_id

  union all

  select
    gp.is_winner,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.secondary_commander_id
)
select
  name,
  max(image_url) filter (where image_url is not null) as image_url,
  count(*)::integer as appearances,
  count(*) filter (where is_winner)::integer as wins,
  case
    when count(*) = 0 then 0
    else (count(*) filter (where is_winner))::double precision / count(*)::double precision
  end as win_rate
from commander_uses
group by name;

create view public.player_directory_entries
with (security_invoker = true)
as
with player_games as (
  select
    gp.id as participant_id,
    gp.player_id,
    p.name,
    gp.is_winner,
    ng.played_at,
    ng.game_number
  from public.game_participants gp
  join public.players p on p.id = gp.player_id
  join public.numbered_games ng on ng.id = gp.game_id
),
latest_player_games as (
  select distinct on (player_id)
    player_id,
    played_at as latest_played_at,
    game_number as latest_game_number
  from player_games
  order by player_id, played_at desc, game_number desc
),
commander_uses as (
  select
    gp.player_id,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.primary_commander_id

  union all

  select
    gp.player_id,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.secondary_commander_id
),
player_commander_counts as (
  select
    player_id,
    name,
    max(image_url) filter (where image_url is not null) as image_url,
    count(*)::integer as appearances
  from commander_uses
  group by player_id, name
),
player_commanders as (
  select
    player_id,
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'imageUrl', image_url,
        'appearances', appearances
      )
      order by appearances desc, name asc
    ) as commanders
  from player_commander_counts
  group by player_id
)
select
  pg.player_id as id,
  pg.name,
  count(pg.participant_id)::integer as games_played,
  count(pg.participant_id) filter (where pg.is_winner)::integer as wins,
  case
    when count(pg.participant_id) = 0 then 0
    else (count(pg.participant_id) filter (where pg.is_winner))::double precision / count(pg.participant_id)::double precision
  end as win_rate,
  lpg.latest_played_at,
  lpg.latest_game_number,
  coalesce(pc.commanders, '[]'::jsonb) as commanders
from player_games pg
join latest_player_games lpg on lpg.player_id = pg.player_id
left join player_commanders pc on pc.player_id = pg.player_id
group by
  pg.player_id,
  pg.name,
  lpg.latest_played_at,
  lpg.latest_game_number,
  pc.commanders;

create view public.player_page_summary
with (security_invoker = true)
as
select
  (select count(*)::integer from public.player_directory_entries) as total_players,
  coalesce((select sum(wins)::integer from public.player_directory_entries), 0) as total_wins,
  (select count(*)::integer from public.commander_summary_entries) as total_commanders,
  (
    select jsonb_build_object(
      'name', name,
      'gamesPlayed', games_played
    )
    from public.player_directory_entries
    order by games_played desc, name asc
    limit 1
  ) as most_games_player,
  (
    select jsonb_build_object(
      'name', name,
      'gamesPlayed', games_played,
      'wins', wins,
      'winRate', win_rate
    )
    from public.player_directory_entries
    order by win_rate desc, wins desc, name asc
    limit 1
  ) as highest_win_rate_player,
  (
    select jsonb_build_object(
      'name', name,
      'appearances', appearances
    )
    from public.commander_summary_entries
    order by appearances desc, name asc
    limit 1
  ) as most_popular_commander,
  (
    select jsonb_build_object(
      'name', name,
      'wins', wins,
      'appearances', appearances,
      'winRate', win_rate
    )
    from public.commander_summary_entries
    order by win_rate desc, wins desc, name asc
    limit 1
  ) as highest_commander_win_rate;

-- Data API grants
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.players to anon, authenticated;
grant select, insert, update, delete on table public.commanders to anon, authenticated;
grant select, insert, update, delete on table public.games to anon, authenticated;
grant select, insert, update, delete on table public.game_participants to anon, authenticated;
grant select on table public.numbered_games to anon, authenticated;
grant select on table public.dashboard_summary to anon, authenticated;
grant select on table public.commander_summary_entries to anon, authenticated;
grant select on table public.player_directory_entries to anon, authenticated;
grant select on table public.player_page_summary to anon, authenticated;
grant execute on function public.set_game_winner(uuid, uuid) to anon, authenticated;
grant execute on function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb) to anon, authenticated;

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
