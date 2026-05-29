-- update_player_display_name RPC
--
-- Replaces the client-side createOrLinkPlayer upsert logic with a single
-- server-side function that handles all three cases:
--
--   First time: no linked player yet → create/find player, set linked_user_id,
--               update profiles.player_id.
--
--   Case A (new unique name): UPDATE display_name on the existing player record
--               in-place. All game_participants already point to that player_id,
--               so game history reflects the new name automatically. No relink.
--
--   Case B (name matches existing player): full merge.
--               Relink ALL game_participants from old player_id to the existing
--               player_id. Uses the null-intermediate pattern required by the
--               winner consistency trigger. Transfers linked_user_id and
--               profiles.player_id to the existing player.
--
-- SECURITY DEFINER is required because game_participants and games are
-- owned by the game creator (a different user), so the participant cannot
-- update those rows via RLS directly.

create or replace function public.update_player_display_name(p_new_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id            uuid    := auth.uid();
  v_trimmed            text    := trim(p_new_display_name);
  v_current_player_id  uuid;
  v_owner_user_id      uuid;
  v_existing_player_id uuid;
  v_winner_game_ids    uuid[];
begin
  if v_user_id is null then
    raise exception 'update_player_display_name requires an authenticated user';
  end if;

  if nullif(v_trimmed, '') is null then
    raise exception 'display name cannot be blank';
  end if;

  -- Find the player currently linked to this auth user
  select p.id, p.user_id
    into v_current_player_id, v_owner_user_id
  from public.players p
  where p.linked_user_id = v_user_id;

  if not found then
    -- ── First-time setup ────────────────────────────────────────────────────
    -- Clear any stale linked_user_id on other players the user may own
    update public.players set linked_user_id = null
    where user_id = v_user_id and linked_user_id = v_user_id;

    -- Create or adopt player with this display name
    insert into public.players (user_id, display_name, linked_user_id)
    values (v_user_id, v_trimmed, v_user_id)
    on conflict (user_id, display_name) do update
      set linked_user_id = v_user_id
    returning id into v_current_player_id;

    update public.profiles set player_id = v_current_player_id where id = v_user_id;
    return v_current_player_id;
  end if;

  -- No-op if name is unchanged
  if exists (
    select 1 from public.players
    where id = v_current_player_id and display_name = v_trimmed
  ) then
    return v_current_player_id;
  end if;

  -- Is there a different player with the new name under the same owner?
  select id into v_existing_player_id
  from public.players
  where user_id = v_owner_user_id
    and display_name = v_trimmed
    and id <> v_current_player_id;

  if not found then
    -- ── Case A: new unique name — UPDATE in-place ────────────────────────────
    -- game_participants already reference v_current_player_id; display name
    -- change propagates automatically to all game history.
    update public.players set display_name = v_trimmed where id = v_current_player_id;
    return v_current_player_id;
  end if;

  -- ── Case B: name matches existing player — full merge ─────────────────────
  -- Must use null-intermediate pattern to satisfy the winner consistency trigger
  -- (trg_enforce_game_winner_consistency_from_participants) which fires on every
  -- game_participants row update and checks games.winner_player_id.

  -- Step 1: null winner_player_id on affected games and capture their IDs
  with nulled as (
    update public.games
    set winner_player_id = null
    where winner_player_id = v_current_player_id
    returning id
  )
  select array_agg(id) into v_winner_game_ids from nulled;

  -- Step 2: relink all game_participants to the existing player
  update public.game_participants
  set player_id = v_existing_player_id
  where player_id = v_current_player_id;

  -- Step 3: restore winner_player_id on exactly the games nulled in step 1
  if v_winner_game_ids is not null then
    update public.games
    set winner_player_id = v_existing_player_id
    where id = any(v_winner_game_ids);
  end if;

  -- Transfer linked identity to the existing player
  update public.players set linked_user_id = null  where id = v_current_player_id;
  update public.players set linked_user_id = v_user_id where id = v_existing_player_id;

  -- Update profile
  update public.profiles set player_id = v_existing_player_id where id = v_user_id;

  return v_existing_player_id;
end;
$$;

revoke all on function public.update_player_display_name(text) from anon, public;
grant execute on function public.update_player_display_name(text) to authenticated;
