# Project Context

## Current App State

- The app is a no-login MTG Commander tracker backed directly by a live Supabase project.
- Navigation now uses a compact horizontal top bar with a branded `PodTracker` logo, a highlighted `Add Game` nav action, and a theme button on the right.
- The main active pages are Dashboard, Add Game, Game History, and Players.
- Dashboard now surfaces compact live stat cards, a deep-linked latest-game card, clickable recent-game rows, and a header-level `Add Game` action.
- Add Game supports optional unfinished games, reusable win-condition suggestions, player-name autocomplete, player-specific commander suggestions, partner/background-style secondary commanders, centered commander art, and one-at-a-time partner/background carousel controls.
- Game History supports inline game editing for bracket, win condition, notes, and winner selection, with winner changes applied through the shared `set_game_winner` database function.
- Players renders live player tiles plus summary stat cards derived from saved history, along with URL-backed filtering.

## Recent Work

- Reworked the app shell from a left sidebar to a top navigation bar, added a branded `PodTracker` mark, and removed the standalone Commanders page from active navigation.
- Refined the Dashboard into `Pod Highlights`, added compact metric cards, moved the `Add Game` action into the header area, and made the latest and recent game entries deep-link into History.
- Turned Dashboard metric cards into full-tile links for History and Players navigation.
- Renamed and tightened Add Game page copy and controls, consolidating the top filters into one row for bracket, date, seats, and finished state.
- Made Add Game support unfinished games by hiding winner and win-condition requirements until `Finished game` is enabled.
- Reworked Add Game seat-card layouts to emphasize larger commander art, with arrow-based horizontal cycling for two-card commander setups.
- Added a labeled `Game Notes` panel with a 500-character limit, live character count, and shared styling between Add Game and History.
- Expanded Game History editing so one `Edit game` flow now updates bracket, win condition, notes, and winner state together.
- Reworked History tile headers so game metadata, inline edit controls, winner state, and edit/save actions are more compact and visually grouped.
- Replaced the History winner dropdown interaction with per-seat winner buttons inside each seat card while editing.
- Added bracket and win-condition filters to Game History alongside the player filter, all backed by URL params.
- Added navigation from History player names into Players and from Players back into History using pre-filled URL filters.
- Expanded Players summary cards to include most-played player, highest win-rate player, most-played commander, and highest commander win rate, plus a clearer filter bar with inline reset.
- Fixed the live `set_game_winner` SQL function so winner changes safely clear the old winner before assigning the new one, avoiding the unique partial-index violation on `game_participants.is_winner`.

## Key Files

- `src/pages/AddGamePage.tsx`
  Add Game form state, finished-game toggle behavior, player suggestions, commander selection, seat-card art carousel behavior, notes capture, and save flow.
- `src/pages/GameHistoryPage.tsx`
  Filtered history list, inline edit mode for bracket/win condition/notes, seat-card winner selection, player-to-Players navigation, and Scryfall links.
- `src/pages/PlayersPage.tsx`
  Player summary cards, URL-backed player filtering, player-to-history navigation, and commander-link rendering.
- `src/lib/gameRecords.ts`
  Shared reads for dashboard/history/player summaries plus the `setGameWinner` RPC wrapper.
- `src/pages/DashboardPage.tsx`
  Compact home-page stat cards, latest/recent game deep links, and top-level `Add Game` action placement.
- `src/lib/scryfall.ts`
  Commander search helpers and the shared Scryfall URL builder.
- `src/components/Layout.tsx`
  Top navigation shell, branded logo, highlighted `Add Game` nav treatment, and theme menu.
- `src/index.css`
  App-wide layout plus the shared visual language for Dashboard, Add Game, History, Players, commander art stages, and notes panels.
- `schema.sql`
  Current schema plus the corrected `set_game_winner` function and winner consistency triggers.

## Validation Status

- `npm test -- --run` passes.
- `npm run build` passes.
- Schema and code-path validation confirmed that the core shared game fields stay aligned across pages:
  - `games.played_at`
  - `games.number_of_players`
  - `games.bracket`
  - `games.win_condition`
  - `games.notes`
  - `games.winner_player_id`
  - `games.winner_participant_id`
  - `game_participants.turn_order_position`
  - `game_participants.primary_commander_id`
  - `game_participants.secondary_commander_id`
  - `game_participants.is_winner`
- Live Supabase validation confirmed Add Game writes succeed and surface through history/player reads.
- Live Supabase validation also confirmed History edit saves correctly update:
  - `games.bracket`
  - `games.win_condition`
  - `games.notes`
  - `games.winner_participant_id`
  - `games.winner_player_id`
  - `game_participants.is_winner`
- The live `set_game_winner` function was patched during this session and revalidated successfully after the fix.

## Known Caveats

- The app still uses broad public Supabase access with permissive RLS for this no-login setup.
- Game creation still happens as multiple client-side writes rather than a single transactional RPC.
- Players summary cards currently derive their metrics client-side from full history reads, which will eventually become a scaling bottleneck.
- History and Players filters are URL-backed client filters rather than server-side filtered queries.
- The repo still contains `src/pages/CommandersPage.tsx`, but the route now redirects to home and the page is no longer exposed in navigation.

## TODO Notes

- Convert Add Game creation into a single transactional database function or RPC.
- Add a game-service field or selector for `paper`, `Convoke`, or `Spelltable`.
- Consider pushing player and commander summary aggregation into SQL for better performance at larger data volumes.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
