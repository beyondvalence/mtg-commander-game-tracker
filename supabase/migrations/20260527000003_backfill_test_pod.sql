-- Backfill: create 'test-pod' for each distinct user_id that has games,
-- add them as admin, link their player identity, and assign pod_id.
-- Runs in a single transaction — rolls back fully on any error.

do $$
declare
  v_user_id   uuid;
  v_pod_id    uuid;
  v_player_id uuid;
begin
  for v_user_id in
    select distinct user_id from public.games where pod_id is null
    union
    select distinct user_id from public.game_participants where pod_id is null
  loop
    -- Create test-pod for this user
    insert into public.pods(name, created_by)
    values ('test-pod', v_user_id)
    returning id into v_pod_id;

    -- Add user as admin
    insert into public.pod_members(pod_id, user_id, role)
    values (v_pod_id, v_user_id, 'admin')
    on conflict (pod_id, user_id) do nothing;

    -- Link their player identity if set
    select player_id into v_player_id
    from public.profiles
    where id = v_user_id;

    if v_player_id is not null then
      insert into public.pod_player_links(pod_id, user_id, player_id)
      values (v_pod_id, v_user_id, v_player_id)
      on conflict (pod_id, user_id) do nothing;
    end if;

    -- Backfill games
    update public.games
    set pod_id = v_pod_id
    where user_id = v_user_id and pod_id is null;

    -- Backfill game_participants
    update public.game_participants
    set pod_id = v_pod_id
    where user_id = v_user_id and pod_id is null;

    -- Backfill user_commanders from this user's commanders table
    insert into public.user_commanders(user_id, scryfall_id, name, image_url, color_identity)
    select distinct
      c.user_id,
      c.scryfall_id,
      c.name,
      c.image_url,
      c.color_identity
    from public.commanders c
    where c.user_id = v_user_id
    on conflict (user_id, scryfall_id) where scryfall_id is not null
    do nothing;

  end loop;
end;
$$;
