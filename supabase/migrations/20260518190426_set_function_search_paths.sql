alter function public.set_updated_at()
set search_path = '';

alter function public.enforce_game_winner_consistency()
set search_path = '';

alter function public.sync_game_participant_count()
set search_path = '';

alter function public.set_game_winner(uuid, uuid)
set search_path = '';

alter function public.create_game_with_participants(date, integer, integer, text, text, integer, text, jsonb)
set search_path = '';
