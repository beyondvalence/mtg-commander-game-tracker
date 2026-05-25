create or replace function public.relink_participant_player(
  p_participant_id uuid,
  p_game_id uuid,
  p_new_player_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_player_id uuid;
  v_is_winner boolean;
begin
  if v_user_id is null then
    raise exception 'relink_participant_player requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.id = p_participant_id
      and gp.game_id = p_game_id
      and gp.user_id = v_user_id
  ) then
    raise exception 'participant % not found for game % and current user', p_participant_id, p_game_id;
  end if;

  -- Find or create the target player
  insert into public.players (user_id, name)
  values (v_user_id, trim(p_new_player_name))
  on conflict (user_id, name) do update set name = excluded.name
  returning id into v_new_player_id;

  -- Check if this participant is the current winner
  select gp.is_winner into v_is_winner
  from public.game_participants gp
  where gp.id = p_participant_id;

  if v_is_winner then
    -- Null out winner_player_id so the consistency trigger allows
    -- the participant player_id change without a cross-table mismatch
    update public.games
    set winner_player_id = null
    where id = p_game_id and user_id = v_user_id;
  end if;

  update public.game_participants
  set player_id = v_new_player_id
  where id = p_participant_id and user_id = v_user_id;

  if v_is_winner then
    -- Restore winner_player_id pointing to the new player
    update public.games
    set winner_player_id = v_new_player_id
    where id = p_game_id and user_id = v_user_id;
  end if;
end;
$$;

revoke all on function public.relink_participant_player(uuid, uuid, text) from anon, public;
grant execute on function public.relink_participant_player(uuid, uuid, text) to authenticated;
