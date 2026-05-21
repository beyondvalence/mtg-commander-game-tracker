-- Owner-only auth/RLS migration for the v0.2 auth spec.
-- The dev owner UUID is intentionally explicit so existing no-login data is
-- assigned to one account before anonymous database access is removed.

do $$
declare
  v_owner_id constant uuid := '673b2a37-1799-4fcc-9dd2-d6598d36ee4b';
begin
  if not exists (
    select 1
    from auth.users
    where id = v_owner_id
  ) then
    raise exception 'Owner auth user % does not exist. Create the dev owner user before applying this migration.', v_owner_id;
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, email)
select id, email
from auth.users
where id = '673b2a37-1799-4fcc-9dd2-d6598d36ee4b'::uuid
on conflict (id) do update
set email = excluded.email;

alter table public.players add column if not exists user_id uuid;
alter table public.commanders add column if not exists user_id uuid;
alter table public.games add column if not exists user_id uuid;
alter table public.game_participants add column if not exists user_id uuid;

update public.players
set user_id = '673b2a37-1799-4fcc-9dd2-d6598d36ee4b'::uuid
where user_id is null;

update public.commanders
set user_id = '673b2a37-1799-4fcc-9dd2-d6598d36ee4b'::uuid
where user_id is null;

update public.games
set user_id = '673b2a37-1799-4fcc-9dd2-d6598d36ee4b'::uuid
where user_id is null;

update public.game_participants
set user_id = '673b2a37-1799-4fcc-9dd2-d6598d36ee4b'::uuid
where user_id is null;

alter table public.players alter column user_id set not null;
alter table public.commanders alter column user_id set not null;
alter table public.games alter column user_id set not null;
alter table public.game_participants alter column user_id set not null;

alter table public.players
drop constraint if exists players_user_id_fkey,
add constraint players_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.commanders
drop constraint if exists commanders_user_id_fkey,
add constraint commanders_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.games
drop constraint if exists games_user_id_fkey,
add constraint games_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.game_participants
drop constraint if exists game_participants_user_id_fkey,
add constraint game_participants_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.players drop constraint if exists players_name_unique;
alter table public.players drop constraint if exists players_user_name_unique;
alter table public.players add constraint players_user_name_unique unique (user_id, name);

alter table public.commanders drop constraint if exists commanders_scryfall_unique;
alter table public.commanders drop constraint if exists commanders_user_scryfall_unique;
create unique index if not exists commanders_user_scryfall_unique
on public.commanders (user_id, scryfall_id)
where scryfall_id is not null;

create index if not exists idx_players_user_id on public.players(user_id);
create index if not exists idx_commanders_user_id on public.commanders(user_id);
create index if not exists idx_games_user_id on public.games(user_id);
create index if not exists idx_game_participants_user_id on public.game_participants(user_id);
create index if not exists idx_games_winner_player_id on public.games(winner_player_id);
create index if not exists idx_games_winner_participant_id on public.games(winner_participant_id);
create index if not exists idx_game_participants_player_id on public.game_participants(player_id);
create index if not exists idx_game_participants_primary_commander_id on public.game_participants(primary_commander_id);
create index if not exists idx_game_participants_secondary_commander_id on public.game_participants(secondary_commander_id);

create or replace function public.set_game_winner(
  p_game_id uuid,
  p_winner_participant_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_winner_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'set_game_winner requires an authenticated user';
  end if;

  if not exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.user_id = v_user_id
  ) then
    raise exception 'game % was not found for the authenticated user', p_game_id;
  end if;

  if p_winner_participant_id is not null then
    select gp.player_id
      into v_winner_player_id
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.id = p_winner_participant_id
      and gp.user_id = v_user_id;

    if v_winner_player_id is null then
      raise exception 'winner participant % was not found for game %', p_winner_participant_id, p_game_id;
    end if;
  end if;

  update public.game_participants
  set is_winner = false
  where game_id = p_game_id
    and user_id = v_user_id
    and is_winner = true;

  if p_winner_participant_id is not null then
    update public.game_participants
    set is_winner = true
    where game_id = p_game_id
      and id = p_winner_participant_id
      and user_id = v_user_id;
  end if;

  update public.games
  set winner_participant_id = p_winner_participant_id,
      winner_player_id = v_winner_player_id
  where id = p_game_id
    and user_id = v_user_id;
end;
$$;

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
  v_user_id uuid := auth.uid();
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
  if v_user_id is null then
    raise exception 'create_game_with_participants requires an authenticated user';
  end if;

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
    user_id,
    played_at,
    number_of_players,
    bracket,
    service,
    turn_length,
    win_condition,
    notes
  )
  values (
    v_user_id,
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

    insert into public.players (user_id, name)
    values (v_user_id, trim(v_participant->>'player_name'))
    on conflict (user_id, name) do update
    set name = excluded.name
    returning id into v_player_id;

    insert into public.commanders (
      user_id,
      scryfall_id,
      name,
      image_url,
      color_identity,
      type_line,
      oracle_text
    )
    values (
      v_user_id,
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
    on conflict (user_id, scryfall_id) where scryfall_id is not null do update
    set name = excluded.name,
        image_url = excluded.image_url,
        color_identity = excluded.color_identity,
        type_line = excluded.type_line,
        oracle_text = excluded.oracle_text
    returning id into v_primary_commander_id;

    v_secondary_commander_id := null;

    if v_participant->'secondary_commander' is not null then
      insert into public.commanders (
        user_id,
        scryfall_id,
        name,
        image_url,
        color_identity,
        type_line,
        oracle_text
      )
      values (
        v_user_id,
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
      on conflict (user_id, scryfall_id) where scryfall_id is not null do update
      set name = excluded.name,
          image_url = excluded.image_url,
          color_identity = excluded.color_identity,
          type_line = excluded.type_line,
          oracle_text = excluded.oracle_text
      returning id into v_secondary_commander_id;
    end if;

    insert into public.game_participants (
      user_id,
      game_id,
      player_id,
      turn_order_position,
      primary_commander_id,
      secondary_commander_id,
      is_winner
    )
    values (
      v_user_id,
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
      and gp.user_id = v_user_id
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
        and gp.user_id = v_user_id
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

revoke all on schema public from anon;
grant usage on schema public to authenticated;

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.players from anon;
revoke all privileges on table public.commanders from anon;
revoke all privileges on table public.games from anon;
revoke all privileges on table public.game_participants from anon;
revoke all privileges on table public.numbered_games from anon;
revoke all privileges on table public.dashboard_summary from anon;
revoke all privileges on table public.commander_summary_entries from anon;
revoke all privileges on table public.player_directory_entries from anon;
revoke all privileges on table public.player_page_summary from anon;
revoke execute on function public.set_game_winner(uuid, uuid) from anon;
revoke execute on function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb) from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.players to authenticated;
grant select, insert, update, delete on table public.commanders to authenticated;
grant select, insert, update, delete on table public.games to authenticated;
grant select, insert, update, delete on table public.game_participants to authenticated;
grant select on table public.numbered_games to authenticated;
grant select on table public.dashboard_summary to authenticated;
grant select on table public.commander_summary_entries to authenticated;
grant select on table public.player_directory_entries to authenticated;
grant select on table public.player_page_summary to authenticated;
grant execute on function public.set_game_winner(uuid, uuid) to authenticated;
grant execute on function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb) to authenticated;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.commanders enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;

drop policy if exists "Users can manage own profile" on public.profiles;
create policy "Users can manage own profile"
on public.profiles
for all
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own players" on public.players;
drop policy if exists "Users can insert own players" on public.players;
drop policy if exists "Users can update own players" on public.players;
drop policy if exists "Users can delete own players" on public.players;
drop policy if exists "Single user can manage players" on public.players;
drop policy if exists "Authenticated users can manage own players" on public.players;
create policy "Authenticated users can manage own players"
on public.players
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own commanders" on public.commanders;
drop policy if exists "Users can insert own commanders" on public.commanders;
drop policy if exists "Users can update own commanders" on public.commanders;
drop policy if exists "Users can delete own commanders" on public.commanders;
drop policy if exists "Single user can manage commanders" on public.commanders;
drop policy if exists "Authenticated users can manage own commanders" on public.commanders;
create policy "Authenticated users can manage own commanders"
on public.commanders
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own games" on public.games;
drop policy if exists "Users can insert own games" on public.games;
drop policy if exists "Users can update own games" on public.games;
drop policy if exists "Users can delete own games" on public.games;
drop policy if exists "Single user can manage games" on public.games;
drop policy if exists "Authenticated users can manage own games" on public.games;
create policy "Authenticated users can manage own games"
on public.games
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own game participants" on public.game_participants;
drop policy if exists "Users can insert own game participants" on public.game_participants;
drop policy if exists "Users can update own game participants" on public.game_participants;
drop policy if exists "Users can delete own game participants" on public.game_participants;
drop policy if exists "Single user can manage game participants" on public.game_participants;
drop policy if exists "Authenticated users can manage own game participants" on public.game_participants;
create policy "Authenticated users can manage own game participants"
on public.game_participants
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
