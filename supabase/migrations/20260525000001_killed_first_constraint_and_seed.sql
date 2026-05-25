-- Prevent a participant from being both winner and killed first
alter table public.game_participants
add constraint game_participants_winner_not_killed_first
check (not (is_winner and killed_first));

-- Seed existing games: assign killed_first to one random non-winner per game
update public.game_participants gp
set killed_first = true
from (
  select distinct on (game_id) id
  from public.game_participants
  where is_winner = false
  order by game_id, random()
) chosen
where gp.id = chosen.id;
