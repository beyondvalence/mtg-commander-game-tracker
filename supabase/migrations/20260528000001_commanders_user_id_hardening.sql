-- Phase A: commanders.user_id hardening
--
-- Problem: create_game_with_participants stamps ALL commander records with the
-- game creator's user_id (v_user_id), regardless of which participant played them.
-- Bob's commanders end up owned by Alice (the pod admin who created the game).
--
-- Fix:
--   1. Add a pod-member SELECT policy on commanders so pod members can read each
--      other's commanders when viewing shared game history (required because after
--      this change, commanders will be owned by different users).
--   2. Update create_game_with_participants to resolve each participant's actual
--      auth user (via players.linked_user_id) and use that for commander inserts.
--      Falls back to game creator's user_id if linked_user_id is NULL (historical
--      / unlinked players are untouched).

-- ── 1. Add pod-member SELECT policy on commanders ─────────────────────────────
-- Mirrors the pattern already on games + game_participants.
-- Allows: own commanders OR commanders used in games in shared pods.
drop policy if exists "commanders_pod_member_select" on public.commanders;
create policy "commanders_pod_member_select" on public.commanders
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.game_participants gp
      where (
        gp.primary_commander_id = commanders.id
        or gp.secondary_commander_id = commanders.id
      )
      and exists (
        select 1 from public.pod_members pm
        where pm.pod_id = gp.pod_id
          and pm.user_id = (select auth.uid())
      )
    )
  );

-- ── 2. Update create_game_with_participants: use participant's linked_user_id ──
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
  v_user_id                uuid := auth.uid();
  v_game_id                uuid;
  v_participant            jsonb;
  v_player_id              uuid;
  v_participant_user_id    uuid;  -- actual player's user_id for commander ownership
  v_primary_commander_id   uuid;
  v_secondary_commander_id uuid;
  v_inserted_participant_id uuid;
  v_winner_participant_id  uuid;
  v_winner_count           integer := 0;
  v_participant_count      integer := 0;
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

    -- Use the player's own auth user for commander ownership if linked; else game creator.
    select coalesce(p.linked_user_id, v_user_id)
      into v_participant_user_id
    from public.players p
    where p.id = v_player_id;

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
      v_participant_user_id,
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
        v_participant_user_id,
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
