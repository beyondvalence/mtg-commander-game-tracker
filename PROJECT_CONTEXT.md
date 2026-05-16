# Project Context

## Current App State

- The app is a no-login MTG Commander tracker backed directly by a live Supabase project.
- Navigation now uses a compact horizontal top bar with a theme button on the right.
- The main active pages are Dashboard, Add Game, Game History, and Players.
- Add Game supports optional unfinished games, reusable win-condition suggestions, player-name autocomplete, player-specific commander suggestions, and partner/background-style secondary commanders.
- Game History supports inline game editing for title, win condition, and winner selection, with winner changes applied through the shared `set_game_winner` database function.
- Players renders live player tiles plus summary stat cards derived from saved history.

## Recent Work

- Reworked the app shell from a left sidebar to a top navigation bar and removed the standalone Commanders page from active navigation.
- Renamed the Add Game screen title, tightened the page controls, and moved the game notes field into the main Add Game flow.
- Made Add Game support unfinished games by hiding winner and win-condition requirements until `Finished game` is enabled.
- Reworked seat-card layouts on Add Game and Game History to emphasize commander art and simpler winner interactions.
- Added clickable Scryfall links from commander names and art across Add Game, Game History, and Players.
- Expanded Game History editing so one `Edit game` flow now updates title, win condition, and winner state together.
- Replaced the History winner dropdown interaction with per-seat winner buttons inside each seat card while editing.
- Fixed the live `set_game_winner` SQL function so winner changes safely clear the old winner before assigning the new one, avoiding the unique partial-index violation on `game_participants.is_winner`.
- Expanded Players summary cards to include most-played player, highest win-rate player, most-played commander, and highest commander win rate.
- Added navigation from a player tile into Game History with that player pre-filled as the filter.

## Key Files

- `src/pages/AddGamePage.tsx`
  Add Game form state, finished-game toggle behavior, player suggestions, commander selection, notes capture, and save flow.
- `src/pages/GameHistoryPage.tsx`
  Filtered history list, inline edit mode, win-condition dropdown editing, seat-card winner selection, and Scryfall links.
- `src/pages/PlayersPage.tsx`
  Player summary cards, player search, player-to-history navigation, and commander-link rendering.
- `src/lib/gameRecords.ts`
  Shared reads for history and player summaries plus the `setGameWinner` RPC wrapper.
- `src/lib/scryfall.ts`
  Commander search helpers and the shared Scryfall URL builder.
- `src/components/Layout.tsx`
  Top navigation shell and theme menu.
- `src/index.css`
  App-wide layout and card styling for Add Game, History, and Players.
- `schema.sql`
  Current schema plus the corrected `set_game_winner` function and winner consistency triggers.

## Validation Status

- `npm test -- --run` passes.
- `npm run build` passes.
- Live Supabase validation confirmed Add Game writes succeed and surface through history/player reads.
- Live Supabase validation also confirmed History edit saves correctly update:
  - `games.title`
  - `games.win_condition`
  - `games.winner_participant_id`
  - `games.winner_player_id`
  - `game_participants.is_winner`
- The live `set_game_winner` function was patched during this session and revalidated successfully after the fix.

## Known Caveats

- The app still uses broad public Supabase access with permissive RLS for this no-login setup.
- Game creation still happens as multiple client-side writes rather than a single transactional RPC.
- Players summary cards currently derive their metrics client-side from full history reads, which will eventually become a scaling bottleneck.
- The repo still contains `src/pages/CommandersPage.tsx`, but the route now redirects to home and the page is no longer exposed in navigation.

## TODO Notes

- Convert Add Game creation into a single transactional database function or RPC.
- Add a game-service field or selector for `paper`, `Convoke`, or `Spelltable`.
- Consider pushing player and commander summary aggregation into SQL for better performance at larger data volumes.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
