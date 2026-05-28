-- Replace create_game_with_participants, set_game_winner, and relink_participant_player
-- with pod-aware versions. Callers must be admins of the target pod.

-- Drop old signatures first so the new ones can be clean replacements.
drop function if exists public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb);

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

    insert into public.players (user_id, name)
    values (v_user_id, trim(v_participant->>'player_name'))
    on conflict (user_id, name) do update set name = excluded.name
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

-- set_game_winner: allow pod admins (not just the game's user_id owner)

create or replace function public.set_game_winner(
  p_game_id              uuid,
  p_winner_participant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := auth.uid();
  v_winner_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'set_game_winner requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.games g
    where g.id = p_game_id
    and (
      g.user_id = v_user_id
      or exists (
        select 1 from public.pod_members pm
        where pm.pod_id = g.pod_id and pm.user_id = v_user_id and pm.role = 'admin'
      )
    )
  ) then
    raise exception 'game % was not found or caller is not authorized', p_game_id;
  end if;

  if p_winner_participant_id is not null then
    select gp.player_id
      into v_winner_player_id
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.id = p_winner_participant_id;

    if v_winner_player_id is null then
      raise exception 'winner participant % was not found for game %', p_winner_participant_id, p_game_id;
    end if;
  end if;

  update public.game_participants
  set is_winner = false
  where game_id = p_game_id and is_winner = true;

  if p_winner_participant_id is not null then
    update public.game_participants
    set is_winner = true
    where game_id = p_game_id and id = p_winner_participant_id;
  end if;

  update public.games
  set
    winner_participant_id = p_winner_participant_id,
    winner_player_id      = v_winner_player_id,
    finished              = (p_winner_participant_id is not null)
  where id = p_game_id;
end;
$$;

-- relink_participant_player: allow pod admins

create or replace function public.relink_participant_player(
  p_participant_id  uuid,
  p_game_id         uuid,
  p_new_player_name text
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

  -- Use the game's original owner user_id for player upsert to preserve (user_id, name) uniqueness
  insert into public.players (user_id, name)
  values (v_game_user_id, trim(p_new_player_name))
  on conflict (user_id, name) do update set name = excluded.name
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

revoke all on function public.create_game_with_participants(uuid, date, integer, integer, text, text, integer, text, jsonb) from anon, public;
revoke all on function public.set_game_winner(uuid, uuid) from anon, public;
revoke all on function public.relink_participant_player(uuid, uuid, text) from anon, public;

grant execute on function public.create_game_with_participants(uuid, date, integer, integer, text, text, integer, text, jsonb) to authenticated;
grant execute on function public.set_game_winner(uuid, uuid) to authenticated;
grant execute on function public.relink_participant_player(uuid, uuid, text) to authenticated;
