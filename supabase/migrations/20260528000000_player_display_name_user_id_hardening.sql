-- Harden player identity model:
--   1. Rename players.name → players.display_name (editable, not a structural key)
--   2. Add players.linked_user_id (the auth user this player IS, nullable, unique)
--   3. Backfill linked_user_id from existing profiles.player_id links
--   4. Update RLS to allow a user to access their own player via linked_user_id
--   5. Recreate views (player_directory_entries, player_page_summary, numbered_games)
--      to reference display_name instead of name
--   6. Update RPCs (create_game_with_participants, relink_participant_player)
--      to use display_name column

-- ── 1. Rename column ──────────────────────────────────────────────────────────
alter table public.players rename column name to display_name;

-- ── 2. Add linked_user_id ─────────────────────────────────────────────────────
alter table public.players
  add column linked_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists idx_players_linked_user_id on public.players(linked_user_id);

-- ── 3. Backfill linked_user_id from existing profile→player links ─────────────
update public.players p
  set linked_user_id = pr.id
  from public.profiles pr
  where pr.player_id = p.id;

-- ── 4. Update RLS: also allow the linked user to read/update their own record ──
drop policy if exists "Authenticated users can manage own players" on public.players;
create policy "Authenticated users can manage own players" on public.players
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    or (select auth.uid()) = linked_user_id
  )
  with check (
    (select auth.uid()) = user_id
    or (select auth.uid()) = linked_user_id
  );

-- ── 5. Recreate views ─────────────────────────────────────────────────────────
-- Drop dependents in order (player_page_summary → player_directory_entries → numbered_games)
drop view if exists public.player_page_summary;
drop view if exists public.player_directory_entries;
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
  g.finished,
  g.pod_id,
  row_number() over (
    order by g.played_at asc, g.created_at asc, g.id asc
  )::integer as game_number
from public.games g;

create view public.player_directory_entries
with (security_invoker = true)
as
with player_games as (
  select
    gp.id as participant_id,
    gp.player_id,
    p.display_name,
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
  pg.display_name,
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
  pg.display_name,
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
      'name', display_name,
      'gamesPlayed', games_played
    )
    from public.player_directory_entries
    order by games_played desc, display_name asc
    limit 1
  ) as most_games_player,
  (
    select jsonb_build_object(
      'name', display_name,
      'gamesPlayed', games_played,
      'wins', wins,
      'winRate', win_rate
    )
    from public.player_directory_entries
    order by win_rate desc, wins desc, display_name asc
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

grant select on table public.numbered_games to anon, authenticated;
grant select on table public.player_directory_entries to anon, authenticated;
grant select on table public.player_page_summary to anon, authenticated;

-- ── 6. Update create_game_with_participants: players upsert uses display_name ──
drop function if exists public.create_game_with_participants(uuid, date, integer, integer, text, text, integer, text, jsonb);

create or replace function public.create_game_with_participants(
  p_pod_id              uuid,
  p_played_at           date,
  p_number_of_players   integer,
  p_bracket             integer,
  p_win_condition       text,
  p_service             text default 'Convoke',
  p_turn_length         integer default null,
  p_notes               text default null,
  p_participants        jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id               uuid := auth.uid();
  v_game_id               uuid;
  v_participant           jsonb;
  v_player_id             uuid;
  v_primary_commander_id  uuid;
  v_secondary_commander_id uuid;
  v_inserted_participant_id uuid;
  v_winner_participant_id uuid;
  v_winner_count          integer := 0;
  v_participant_count     integer := 0;
begin
  if v_user_id is null then
    raise exception 'create_game_with_participants requires an authenticated user';
  end if;

  if p_pod_id is null then
    raise exception 'p_pod_id is required';
  end if;

  if not exists (
    select 1 from public.pod_members
    where pod_id = p_pod_id and user_id = v_user_id and role = 'admin'
  ) then
    raise exception 'not_pod_admin';
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
    pod_id,
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
    p_pod_id,
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
    select value from jsonb_array_elements(p_participants)
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

    insert into public.players (user_id, display_name)
    values (v_user_id, trim(v_participant->>'player_name'))
    on conflict (user_id, display_name) do update set display_name = excluded.display_name
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
    set
      name           = excluded.name,
      image_url      = excluded.image_url,
      color_identity = excluded.color_identity,
      type_line      = excluded.type_line,
      oracle_text    = excluded.oracle_text
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
      set
        name           = excluded.name,
        image_url      = excluded.image_url,
        color_identity = excluded.color_identity,
        type_line      = excluded.type_line,
        oracle_text    = excluded.oracle_text
      returning id into v_secondary_commander_id;
    end if;

    insert into public.game_participants (
      user_id,
      pod_id,
      game_id,
      player_id,
      turn_order_position,
      primary_commander_id,
      secondary_commander_id,
      is_winner,
      killed_first
    )
    values (
      v_user_id,
      p_pod_id,
      v_game_id,
      v_player_id,
      (v_participant->>'seat')::integer,
      v_primary_commander_id,
      v_secondary_commander_id,
      false,
      coalesce((v_participant->>'killed_first')::boolean, false)
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

revoke all on function public.create_game_with_participants(uuid, date, integer, integer, text, text, integer, text, jsonb) from anon, public;
grant execute on function public.create_game_with_participants(uuid, date, integer, integer, text, text, integer, text, jsonb) to authenticated;

-- ── 7. Update relink_participant_player: rename param and use display_name ─────
-- Must drop first — Postgres disallows changing parameter names via CREATE OR REPLACE
drop function if exists public.relink_participant_player(uuid, uuid, text);

create or replace function public.relink_participant_player(
  p_participant_id   uuid,
  p_game_id          uuid,
  p_new_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_new_player_id uuid;
  v_is_winner     boolean;
  v_game_user_id  uuid;
begin
  if v_user_id is null then
    raise exception 'relink_participant_player requires an authenticated user';
  end if;

  select g.user_id into v_game_user_id
  from public.games g
  where g.id = p_game_id
  and (
    g.user_id = v_user_id
    or exists (
      select 1 from public.pod_members pm
      where pm.pod_id = g.pod_id and pm.user_id = v_user_id and pm.role = 'admin'
    )
  );

  if not found then
    raise exception 'game % was not found or caller is not authorized', p_game_id;
  end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.id = p_participant_id and gp.game_id = p_game_id
  ) then
    raise exception 'participant % not found for game %', p_participant_id, p_game_id;
  end if;

  insert into public.players (user_id, display_name)
  values (v_game_user_id, trim(p_new_display_name))
  on conflict (user_id, display_name) do update set display_name = excluded.display_name
  returning id into v_new_player_id;

  select gp.is_winner into v_is_winner
  from public.game_participants gp
  where gp.id = p_participant_id;

  if v_is_winner then
    update public.games
    set winner_player_id = null
    where id = p_game_id;
  end if;

  update public.game_participants
  set player_id = v_new_player_id
  where id = p_participant_id;

  if v_is_winner then
    update public.games
    set winner_player_id = v_new_player_id
    where id = p_game_id;
  end if;
end;
$$;

revoke all on function public.relink_participant_player(uuid, uuid, text) from anon, public;
grant execute on function public.relink_participant_player(uuid, uuid, text) to authenticated;
