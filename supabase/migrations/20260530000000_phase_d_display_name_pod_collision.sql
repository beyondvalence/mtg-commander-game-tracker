-- Phase D: display_name collision detection within a pod.
-- When a user sets their display_name, if another identity-linked pod member
-- already holds that name, raise an exception instead of silently allowing a
-- duplicate. Duplicate names break Phase C's player resolution in
-- create_game_with_participants and fetchAddGamePlayerSuggestions.
--
-- Two paths guarded:
--   (1) First-time setup: before adopting an unlinked player or inserting a new one.
--   (2) Rename path: after the advisory lock, before the Case A/B decision.

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
    -- ── First-time setup ─────────────────────────────────────────────────────
    -- Serialize concurrent first-time-setup calls for the same name to prevent
    -- two users in the same pod both passing the Phase D check simultaneously.
    perform pg_advisory_xact_lock(abs(hashtext('first_time|' || v_trimmed)));

    -- Phase D: block if another linked pod member already holds this display_name.
    if exists (
      select 1
      from public.players p
      join public.pod_members pm1 on pm1.user_id = p.linked_user_id
      join public.pod_members pm2 on pm2.pod_id = pm1.pod_id and pm2.user_id = v_user_id
      where p.display_name = v_trimmed
        and p.linked_user_id is not null
        and p.linked_user_id <> v_user_id
    ) then
      raise exception 'Display name "%" is already taken by another member of your pod — please choose a different name.', v_trimmed;
    end if;

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

  -- Phase D: block if another linked pod member already holds this display_name.
  if exists (
    select 1
    from public.players p
    join public.pod_members pm1 on pm1.user_id = p.linked_user_id
    join public.pod_members pm2 on pm2.pod_id = pm1.pod_id and pm2.user_id = v_user_id
    where p.display_name = v_trimmed
      and p.linked_user_id is not null
      and p.linked_user_id <> v_user_id
  ) then
    raise exception 'Display name "%" is already taken by another member of your pod — please choose a different name.', v_trimmed;
  end if;

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
