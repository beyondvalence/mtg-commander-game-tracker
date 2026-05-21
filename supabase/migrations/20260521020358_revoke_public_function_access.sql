-- Supabase/Postgres grants EXECUTE on functions to PUBLIC by default. Remove
-- that inherited access so anon cannot call app RPCs after auth is enabled.

revoke usage on schema public from anon;
revoke usage on schema public from public;
grant usage on schema public to authenticated;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from public;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.players to authenticated;
grant select, insert, update, delete on table public.commanders to authenticated;
grant select, insert, update, delete on table public.games to authenticated;
grant select, insert, update, delete on table public.game_participants to authenticated;
grant select on table public.numbered_games to authenticated;
grant select on table public.dashboard_summary to authenticated;
grant select on table public.commander_summary_entries to authenticated;
grant select on table public.player_directory_entries to authenticated;
grant select on table public.player_page_summary to authenticated;

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

grant execute on function public.set_game_winner(uuid, uuid) to authenticated;
grant execute on function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb) to authenticated;
