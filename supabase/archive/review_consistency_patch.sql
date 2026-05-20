create or replace function public.enforce_game_winner_consistency()
returns trigger as $$
declare
  v_game_id uuid;
  v_winner_participant_id uuid;
  v_winner_player_id uuid;
  v_marked_winner_count integer;
begin
  if tg_table_name = 'games' then
    v_game_id := coalesce(new.id, old.id);
  else
    v_game_id := coalesce(new.game_id, old.game_id);
  end if;

  select g.winner_participant_id, g.winner_player_id
    into v_winner_participant_id, v_winner_player_id
  from public.games g
  where g.id = v_game_id;

  select count(*)
    into v_marked_winner_count
  from public.game_participants gp
  where gp.game_id = v_game_id
    and gp.is_winner = true;

  if v_winner_participant_id is null then
    if v_marked_winner_count <> 0 then
      raise exception 'game % cannot have any game_participants.is_winner = true rows when winner_participant_id is null', v_game_id;
    end if;

    if v_winner_player_id is not null then
      raise exception 'game % cannot have winner_player_id when winner_participant_id is null', v_game_id;
    end if;

    return null;
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.id = v_winner_participant_id
      and gp.game_id = v_game_id
  ) then
    raise exception 'winner_participant_id % must belong to game %', v_winner_participant_id, v_game_id;
  end if;

  if v_marked_winner_count <> 1 then
    raise exception 'game % must have exactly one game_participants.is_winner = true row', v_game_id;
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = v_game_id
      and gp.id = v_winner_participant_id
      and gp.is_winner = true
  ) then
    raise exception 'winner_participant_id % for game % must be marked is_winner = true', v_winner_participant_id, v_game_id;
  end if;

  if v_winner_player_id is not null and not exists (
    select 1
    from public.game_participants gp
    where gp.id = v_winner_participant_id
      and gp.player_id = v_winner_player_id
  ) then
    raise exception 'games.winner_player_id must match winner participant player_id for game %', v_game_id;
  end if;

  return null;
end;
$$ language plpgsql;

create or replace function public.sync_game_participant_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.game_id is distinct from new.game_id then
    update public.games
    set number_of_players = (
      select count(*)::integer
      from public.game_participants gp
      where gp.game_id = old.game_id
    )
    where id = old.game_id;
  end if;

  update public.games
  set number_of_players = (
    select count(*)::integer
    from public.game_participants gp
    where gp.game_id = case when tg_op = 'DELETE' then old.game_id else new.game_id end
  )
  where id = case when tg_op = 'DELETE' then old.game_id else new.game_id end;

  return null;
end;
$$;

drop trigger if exists trg_sync_game_participant_count on public.game_participants;
create trigger trg_sync_game_participant_count
after insert or update of game_id or delete on public.game_participants
for each row execute function public.sync_game_participant_count();

with winner_rows as (
  select gp.game_id, gp.id as winner_participant_id, gp.player_id as winner_player_id
  from public.game_participants gp
  where gp.is_winner = true
)
update public.games g
set winner_participant_id = winner_rows.winner_participant_id,
    winner_player_id = winner_rows.winner_player_id
from winner_rows
where g.id = winner_rows.game_id
  and (
    g.winner_participant_id is distinct from winner_rows.winner_participant_id
    or g.winner_player_id is distinct from winner_rows.winner_player_id
  );

update public.games g
set winner_participant_id = null,
    winner_player_id = null
where not exists (
  select 1
  from public.game_participants gp
  where gp.game_id = g.id
    and gp.is_winner = true
)
and (
  g.winner_participant_id is not null
  or g.winner_player_id is not null
);

update public.games g
set number_of_players = counts.participant_count
from (
  select gp.game_id, count(*)::integer as participant_count
  from public.game_participants gp
  group by gp.game_id
) counts
where g.id = counts.game_id
  and g.number_of_players is distinct from counts.participant_count;
