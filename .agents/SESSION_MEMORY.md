## Session Memory

- Reworked the app shell from a left sidebar into a compact horizontal top bar with the theme button on the right.
- Add Game now supports finished vs unfinished games, stores freeform text in `games.notes`, and uses tighter seat cards with player suggestions, commander suggestions, and linked commander art.
- Game History now supports one edit flow per game for title, win condition, and winner updates.
- History winner selection was moved into the seat cards themselves during edit mode.
- Added Scryfall links from commander names and art across Add Game, Game History, and Players.
- Players now includes expanded summary cards, compact search placement, player-to-history navigation, and clickable commander chips/art.
- The live Supabase `set_game_winner` function was fixed so it clears the old winner before assigning a new one, avoiding the unique partial-index violation on `game_participants.is_winner`.
- Live validation already confirmed that saving edits correctly updates `games.title`, `games.win_condition`, `games.winner_participant_id`, `games.winner_player_id`, and the matching `game_participants.is_winner` row.
- Current validation baseline: `npm test -- --run` passes and `npm run build` passes.
