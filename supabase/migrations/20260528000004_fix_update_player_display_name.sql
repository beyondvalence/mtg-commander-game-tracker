-- Fix update_player_display_name RPC — addresses four code review findings:
--
--   Fix 1 (dead code): Remove the stale-link clear UPDATE in the first-time
--     path — it always matched 0 rows because the SELECT above it already
--     confirmed no player has linked_user_id = v_user_id.
--
--   Fix 2 (cross-owner isolation): First-time setup now searches for an
--     existing unlinked player with the same display_name in the user's pods
--     before creating a new player. If found, it adopts that player (sets
--     linked_user_id) rather than creating a fresh record with 0 game history.
--     Adoption requires no game_participants relink — the player_id FK is unchanged.
--
--   Fix 3 (cross-namespace merge): The Case B lookup now also searches across
--     other user_id namespaces for unlinked players in shared pods, not only
--     within v_owner_user_id. A pod member who played in games logged by
--     multiple different admins can now fully merge across those namespaces.
--
--   Fix 4 (TOCTOU): Acquire a transaction-scoped advisory lock on (owner, name)
--     before the existence check + Case A/B decision, serializing concurrent
--     calls for the same user to prevent a missed Case B merge.

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
    -- Before creating a new player, check if an unlinked player with this
    -- display_name already exists in one of the user's pods (e.g., a pod admin
    -- logged games for this person before they registered). Adopting that player
    -- preserves full game history without any game_participants relink.
    select p.id into v_existing_player_id
    from public.players p
    where p.display_name = v_trimmed
      and p.linked_user_id is null
      and exists (
        select 1 from public.game_participants gp
        join public.pod_members pm on pm.pod_id = gp.pod_id
        where gp.player_id = p.id
          and pm.user_id = v_user_id
      )
    limit 1;

    if found then
      -- Adopt: claim the existing player record — no game_participants relink needed
      update public.players set linked_user_id = v_user_id where id = v_existing_player_id;
      update public.profiles set player_id = v_existing_player_id where id = v_user_id;
      return v_existing_player_id;
    end if;

    -- No existing pod-history player found: create own player record
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

  -- Serialize concurrent renames for the same (owner, name) combination to
  -- prevent a TOCTOU where two sessions both see NOT FOUND and both take Case A,
  -- silently missing the Case B merge.
  perform pg_advisory_xact_lock(abs(hashtext(v_owner_user_id::text || '|' || v_trimmed)));

  -- Search for a mergeable player: same display_name, different id, and either:
  --   (a) owned by the same creator namespace (v_owner_user_id), or
  --   (b) unlinked AND in a pod the current user belongs to (cross-namespace)
  select p.id into v_existing_player_id
  from public.players p
  where p.display_name = v_trimmed
    and p.id <> v_current_player_id
    and (
      p.user_id = v_owner_user_id
      or (
        p.linked_user_id is null
        and exists (
          select 1 from public.game_participants gp
          join public.pod_members pm on pm.pod_id = gp.pod_id
          where gp.player_id = p.id
            and pm.user_id = v_user_id
        )
      )
    )
  limit 1;

  if not found then
    -- ── Case A: new unique name — UPDATE in-place ────────────────────────────
    update public.players set display_name = v_trimmed where id = v_current_player_id;
    return v_current_player_id;
  end if;

  -- ── Case B: name matches existing player — full merge ─────────────────────
  -- Null-intermediate pattern required by trg_enforce_game_winner_consistency_from_participants.

  -- Step 1: null winner_player_id on affected games; capture their IDs
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

  -- Transfer linked identity
  update public.players set linked_user_id = null      where id = v_current_player_id;
  update public.players set linked_user_id = v_user_id where id = v_existing_player_id;

  update public.profiles set player_id = v_existing_player_id where id = v_user_id;

  return v_existing_player_id;
end;
$$;

revoke all on function public.update_player_display_name(text) from anon, public;
grant execute on function public.update_player_display_name(text) to authenticated;
