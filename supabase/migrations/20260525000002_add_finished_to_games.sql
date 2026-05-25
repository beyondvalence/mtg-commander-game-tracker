alter table public.games
add column if not exists finished boolean not null default false;

-- Backfill existing games that already have a winner
update public.games
set finished = true
where winner_participant_id is not null;

-- Update set_game_winner to maintain finished
create or replace function public.set_game_winner(
  p_game_id uuid,
  p_winner_participant_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_winner_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'set_game_winner requires an authenticated user';
  end if;

  if not exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.user_id = v_user_id
  ) then
    raise exception 'game % was not found for the authenticated user', p_game_id;
  end if;

  if p_winner_participant_id is not null then
    select gp.player_id
      into v_winner_player_id
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.id = p_winner_participant_id
      and gp.user_id = v_user_id;

    if v_winner_player_id is null then
      raise exception 'winner participant % was not found for game %', p_winner_participant_id, p_game_id;
    end if;
  end if;

  update public.game_participants
  set is_winner = false
  where game_id = p_game_id
    and user_id = v_user_id
    and is_winner = true;

  if p_winner_participant_id is not null then
    update public.game_participants
    set is_winner = true
    where game_id = p_game_id
      and id = p_winner_participant_id
      and user_id = v_user_id;
  end if;

  update public.games
  set winner_participant_id = p_winner_participant_id,
      winner_player_id = v_winner_player_id,
      finished = (p_winner_participant_id is not null)
  where id = p_game_id
    and user_id = v_user_id;
end;
$$;

-- Drop dependent views before recreating numbered_games
drop view if exists public.player_page_summary;
drop view if exists public.player_directory_entries;
drop view if exists public.numbered_games;

create view public.numbered_games
with (security_invoker = true)
as
select
  g.id,
  g.played_at,
  g.created_at,
  g.number_of_players,
  g.bracket,
  g.service,
  g.turn_length,
  g.win_condition,
  g.notes,
  g.finished,
  row_number() over (
    order by g.played_at asc, g.created_at asc, g.id asc
  )::integer as game_number
from public.games g;

-- Recreate player_directory_entries (unchanged from original)
create view public.player_directory_entries
with (security_invoker = true)
as
with player_games as (
  select
    gp.id as participant_id,
    gp.player_id,
    p.name,
    gp.is_winner,
    ng.played_at,
    ng.game_number
  from public.game_participants gp
  join public.players p on p.id = gp.player_id
  join public.numbered_games ng on ng.id = gp.game_id
),
latest_player_games as (
  select distinct on (player_id)
    player_id,
    played_at as latest_played_at,
    game_number as latest_game_number
  from player_games
  order by player_id, played_at desc, game_number desc
),
commander_uses as (
  select
    gp.player_id,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.primary_commander_id

  union all

  select
    gp.player_id,
    c.name,
    c.image_url
  from public.game_participants gp
  join public.commanders c on c.id = gp.secondary_commander_id
),
player_commander_counts as (
  select
    player_id,
    name,
    max(image_url) filter (where image_url is not null) as image_url,
    count(*)::integer as appearances
  from commander_uses
  group by player_id, name
),
player_commanders as (
  select
    player_id,
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'imageUrl', image_url,
        'appearances', appearances
      )
      order by appearances desc, name asc
    ) as commanders
  from player_commander_counts
  group by player_id
)
select
  pg.player_id as id,
  pg.name,
  count(pg.participant_id)::integer as games_played,
  count(pg.participant_id) filter (where pg.is_winner)::integer as wins,
  case
    when count(pg.participant_id) = 0 then 0
    else (count(pg.participant_id) filter (where pg.is_winner))::double precision / count(pg.participant_id)::double precision
  end as win_rate,
  lpg.latest_played_at,
  lpg.latest_game_number,
  coalesce(pc.commanders, '[]'::jsonb) as commanders
from player_games pg
join latest_player_games lpg on lpg.player_id = pg.player_id
left join player_commanders pc on pc.player_id = pg.player_id
group by
  pg.player_id,
  pg.name,
  lpg.latest_played_at,
  lpg.latest_game_number,
  pc.commanders;

-- Recreate player_page_summary (unchanged from original)
create view public.player_page_summary
with (security_invoker = true)
as
select
  (select count(*)::integer from public.player_directory_entries) as total_players,
  coalesce((select sum(wins)::integer from public.player_directory_entries), 0) as total_wins,
  (select count(*)::integer from public.commander_summary_entries) as total_commanders,
  (
    select jsonb_build_object(
      'name', name,
      'gamesPlayed', games_played
    )
    from public.player_directory_entries
    order by games_played desc, name asc
    limit 1
  ) as most_games_player,
  (
    select jsonb_build_object(
      'name', name,
      'gamesPlayed', games_played,
      'wins', wins,
      'winRate', win_rate
    )
    from public.player_directory_entries
    order by win_rate desc, wins desc, name asc
    limit 1
  ) as highest_win_rate_player,
  (
    select jsonb_build_object(
      'name', name,
      'appearances', appearances
    )
    from public.commander_summary_entries
    order by appearances desc, name asc
    limit 1
  ) as most_popular_commander,
  (
    select jsonb_build_object(
      'name', name,
      'wins', wins,
      'appearances', appearances,
      'winRate', win_rate
    )
    from public.commander_summary_entries
    order by win_rate desc, wins desc, name asc
    limit 1
  ) as highest_commander_win_rate;

grant select on table public.numbered_games to anon, authenticated;
grant select on table public.player_directory_entries to anon, authenticated;
grant select on table public.player_page_summary to anon, authenticated;
