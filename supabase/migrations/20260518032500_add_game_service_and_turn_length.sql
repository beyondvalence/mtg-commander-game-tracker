alter table public.games add column if not exists turn_length integer;
alter table public.games drop constraint if exists games_turn_length_check;
alter table public.games add constraint games_turn_length_check check (turn_length is null or turn_length > 0);

alter table public.games add column if not exists service text not null default 'Convoke';
alter table public.games drop constraint if exists games_service_check;
alter table public.games add constraint games_service_check check (service in ('paper', 'Convoke', 'Spelltable'));

update public.games
set service = 'Convoke'
where service is null;

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

grant execute on function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb) to anon, authenticated;
