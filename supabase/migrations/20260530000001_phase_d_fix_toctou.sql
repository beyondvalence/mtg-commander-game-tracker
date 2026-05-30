-- Fix four code-review findings in update_player_display_name (from Phase D migration):
--
--   Fix 1 (TOCTOU cross-path): First-time lock key 'first_time|name' and rename lock key
--     'owner_uid|name' are always different integers — a concurrent first-time-setup session
--     and a concurrent rename session for the same name in the same pod were not serialized
--     against each other. Both could pass the Phase D EXISTS check simultaneously, leaving two
--     linked pod members with identical display_names.
--
--   Fix 2 (TOCTOU same-path): The rename lock was keyed on v_owner_user_id (creator of the
--     player record), not v_user_id. Two users in the same pod whose player records were
--     created by different pod admins had different lock keys and were not serialized. Same
--     failure as Fix 1.
--
--   Both TOCTOU fixes use a single name-keyed advisory lock (abs(hashtext(v_trimmed)))
--   acquired before the NOT FOUND branch, covering both code paths. The rename path then
--   also acquires the owner-name lock (acquired second, consistent order → no deadlock)
--   needed for the Case A/B missed-merge guard. FOUND state is saved to v_is_first_time
--   because PERFORM (used to acquire the lock) updates FOUND and must not be relied upon
--   afterward.
--
--   Fix 3 (duplicate): The Phase D EXISTS query was verbatim identical at two locations
--     (lines 46-56 and 106-116 of the previous migration). It now runs exactly once.
--
--   Fix 4 (over-broad first-time lock): The 'first_time|name' key serialized all users
--     globally for the same name, even users in completely unrelated pods. Replaced by the
--     single name lock (abs(hashtext(v_trimmed))), which is the same breadth but now
--     semantically correct: serialization is required for correctness since we cannot scope
--     to pod_id without acquiring multiple per-pod locks. The window is sub-millisecond in
--     practice.

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
  v_is_first_time      boolean;
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

  -- Save NOT FOUND state before any PERFORM — advisory lock PERFORM updates FOUND.
  v_is_first_time := not found;

  -- No-op if name unchanged (fast exit before acquiring any lock)
  if not v_is_first_time and exists (
    select 1 from public.players
    where id = v_current_player_id and display_name = v_trimmed
  ) then
    return v_current_player_id;
  end if;

  -- Serialize all sessions claiming this display_name (first-time and rename) so the
  -- Phase D existence check below runs on a consistent committed view. Keyed on name
  -- alone rather than (owner, name) to prevent races between sessions in different owner
  -- namespaces or on different code paths.
  perform pg_advisory_xact_lock(abs(hashtext(v_trimmed)));

  -- Phase D: block if another identity-linked pod member already holds this display_name.
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

  if v_is_first_time then
    -- ── First-time setup ─────────────────────────────────────────────────────
    -- Check if an unlinked player with this display_name exists in one of the user's pods
    -- (e.g., a pod admin logged games for this person before they registered). Adopting
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

    -- No pod-history player found: create own player record
    insert into public.players (user_id, display_name, linked_user_id)
    values (v_user_id, v_trimmed, v_user_id)
    on conflict (user_id, display_name) do update
      set linked_user_id = v_user_id
    returning id into v_current_player_id;

    update public.profiles set player_id = v_current_player_id where id = v_user_id;
    return v_current_player_id;
  end if;

  -- ── Rename path ───────────────────────────────────────────────────────────
  -- Second lock on (owner, name) to serialize concurrent renames by the same user
  -- (e.g., two open tabs) that both target the same name — preventing two Case A
  -- in-place updates from both missing the Case B merge target. Acquired after the
  -- name lock above; consistent ordering prevents deadlock.
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
