-- Fix user_commanders backfill: the original migration (003) seeded from
-- commanders.user_id which captured ALL commanders ever recorded by an account,
-- including those played by other players at the table.
--
-- Correct seed: only commanders where game_participants.player_id = the user's
-- own linked player (profiles.player_id). This matches "decks I personally played."

-- For each user who has a linked player identity, wipe and re-seed.
do $$
declare
  v_user_id   uuid;
  v_player_id uuid;
begin
  for v_user_id, v_player_id in
    select p.id, p.player_id
    from public.profiles p
    where p.player_id is not null
  loop
    -- Remove existing entries for this user
    delete from public.user_commanders where user_id = v_user_id;

    -- Re-seed from commanders this user's player actually played
    insert into public.user_commanders(user_id, scryfall_id, name, image_url, color_identity)
    select distinct
      v_user_id,
      c.scryfall_id,
      c.name,
      c.image_url,
      c.color_identity
    from public.game_participants gp
    join public.commanders c on c.id = gp.primary_commander_id
    where gp.player_id = v_player_id

    union

    select distinct
      v_user_id,
      c.scryfall_id,
      c.name,
      c.image_url,
      c.color_identity
    from public.game_participants gp
    join public.commanders c on c.id = gp.secondary_commander_id
    where gp.player_id = v_player_id
      and gp.secondary_commander_id is not null

    on conflict (user_id, scryfall_id) where scryfall_id is not null
    do nothing;
  end loop;
end;
$$;
