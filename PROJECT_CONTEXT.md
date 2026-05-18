# Project Context

## Current App State

- The app is a no-login MTG Commander tracker backed directly by a live Supabase project.
- Navigation now uses a compact horizontal top bar with a branded `PodTracker` logo, a highlighted `Add Game` nav action, and a theme button on the right.
- The main active pages are Dashboard, Add Game, Game History, and Players.
- Dashboard now surfaces compact live stat cards, a top-row `Add Game` tile, and clickable recent-game rows with compact metadata, seat-order summaries, and winner badges.
- Add Game supports optional unfinished games, reusable win-condition suggestions, case-sensitive player-name autocomplete matching, player-specific commander suggestions, partner/background-style secondary commanders, centered commander art, one-at-a-time partner/background carousel controls, a collapsed-by-default notes section behind a caret toggle, and finished-game-only `service` plus `turn length` selectors.
- Game History supports inline game editing for bracket, win condition, notes, and winner selection, with winner changes applied through the shared `set_game_winner` database function, plus seat-card art alignment that stays visually consistent when some players have two commanders and case-sensitive player filtering.
- Players renders live player tiles plus SQL-backed summary stat cards derived from saved history, along with URL-backed, case-sensitive filtering.

## Recent Work

- Reworked the app shell from a left sidebar to a top navigation bar, added a branded `PodTracker` mark, and removed the standalone Commanders page from active navigation.
- Refined the Dashboard into `Pod Highlights`, added compact metric cards, moved `Add Game` into the top tile row, removed the latest-game tile, and made recent game entries deep-link into History.
- Tightened the Dashboard top row and page title sizing for a more compact first-screen layout.
- Expanded Dashboard recent-game rows to show bracket and seat-order player summaries, then compressed them into a two-line layout with a styled winner badge.
- Turned Dashboard metric cards into full-tile links for History and Players navigation.
- Renamed and tightened Add Game page copy and controls, consolidating the top filters into one row for bracket, date, seats, and finished state.
- Made Add Game support unfinished games by hiding winner and win-condition requirements until `Finished game` is enabled.
- Reworked Add Game seat-card layouts to emphasize larger commander art, with arrow-based horizontal cycling for two-card commander setups.
- Added a labeled `Game Notes` panel with a 500-character limit, live character count, and shared styling between Add Game and History, then made Add Game notes collapsed by default with a caret toggle.
- Replaced Add Game’s multi-step client save flow with a single transactional `create_game_with_participants` RPC that upserts players and commanders, inserts the game and seats, and then finalizes winner assignment server-side through `set_game_winner`.
- Applied the `create_game_with_participants` RPC to the linked live Supabase project through the Supabase CLI and recorded the migration in remote history.
- Added `service` and `turn_length` game fields end to end across Add Game, shared reads, and the transactional RPC, with `service` defaulting to `Convoke` and both controls only shown for finished games.
- Applied the live Supabase schema update for `games.service` and `games.turn_length`, updated the RPC signature on the linked project, and backfilled existing saved games to `Convoke` plus turn length `9`.
- Expanded Game History editing so one `Edit game` flow now updates bracket, win condition, notes, and winner state together.
- Reworked History tile headers so `Game #` sits on its own line, metadata and inline edit controls sit beneath it, and winner state and edit/save actions remain compact on the right.
- Replaced the History winner dropdown interaction with per-seat winner buttons inside each seat card while editing.
- Added per-game spacing normalization in History so commander art stays aligned across seat cards even when only some players have secondary commanders.
- Added bracket and win-condition filters to Game History alongside the player filter, all backed by URL params.
- Made Add Game suggestion matching, History player filtering, and Players search case-sensitive so app behavior matches case-sensitive participant naming.
- Added navigation from History player names into Players and from Players back into History using pre-filled URL filters.
- Expanded Players summary cards to include most-played player, highest win-rate player, most-played commander, and highest commander win rate, plus a clearer filter bar with inline reset.
- Fixed the live `set_game_winner` SQL function so winner changes safely clear the old winner before assigning the new one, avoiding the unique partial-index violation on `game_participants.is_winner`.
- Applied a live Supabase consistency patch that tightens winner-field enforcement, syncs `games.number_of_players` from `game_participants`, and backfills any existing winner/count drift.
- Moved dashboard counts, game numbering, player directory rows, commander rollups, and Players summary-card aggregation into SQL-backed Supabase views.
- Hardened existing public functions by pinning their `search_path` after Supabase advisors flagged mutable function search paths.
- Reviewed the `/supabase` SQL files and classified migration files as applied-once history, while identifying loose patch scripts as historical single-use artifacts rather than recurring maintenance scripts.
- Reviewed the summary-view implementation and fixed the History participant fetch so full-history reads no longer build a giant `IN (...)` list of every game ID; limited Dashboard reads still scope participants to the three recent games.

## Current Session Summary

- Used the Supabase workflow to move player, commander, dashboard, and game-number aggregation into SQL-backed views.
- Applied the summary-view migration to the linked Supabase project and validated the live view outputs.
- Performed a code review of the aggregation changes, fixed the full-history participant query scaling issue, and ran build/test validation.
- Ran Supabase advisors, found existing mutable function `search_path` warnings, added and applied a function-hardening migration, and recorded that the follow-up advisor rerun was blocked by temporary Supabase auth/circuit-breaker failures.
- Reviewed SQL files under `/supabase`: files in `supabase/migrations/` are canonical applied-once migration history; `supabase/create_game_with_participants_patch.sql` and `supabase/review_consistency_patch.sql` are single-use patch artifacts kept only for historical reference unless archived or removed.

## Key Files

- `src/pages/AddGamePage.tsx`
  Add Game form state, finished-game toggle behavior, case-sensitive player suggestions, commander selection, seat-card art carousel behavior, collapsible notes capture, `service` and `turn length` selectors, and save flow.
- `src/pages/GameHistoryPage.tsx`
  Filtered history list, inline edit mode for bracket/win condition/notes, split game-card headers, service/turn-length metadata display, case-sensitive player filtering, seat-card winner selection, art alignment spacing, player-to-Players navigation, and Scryfall links.
- `src/pages/PlayersPage.tsx`
  Player summary cards, URL-backed case-sensitive player/commander filtering, player-to-history navigation, and commander-link rendering.
- `src/lib/gameRecords.ts`
  Shared reads for dashboard/history/player summaries plus the `setGameWinner` and `createGameWithParticipants` RPC wrappers, including `service` and `turn_length` support.
- `src/pages/DashboardPage.tsx`
  Compact home-page stat cards, top-row `Add Game` tile, and recent-game summaries with seat-order and winner context.
- `src/lib/scryfall.ts`
  Commander search helpers and the shared Scryfall URL builder.
- `src/components/Layout.tsx`
  Top navigation shell, branded logo, highlighted `Add Game` nav treatment, and theme menu.
- `src/index.css`
  App-wide layout plus the shared visual language for Dashboard, Add Game, History, Players, commander art stages, and notes panels.
- `schema.sql`
  Current schema plus the corrected `set_game_winner` function, the transactional `create_game_with_participants` RPC, `games.service` and `games.turn_length`, stricter winner consistency enforcement, participant-count sync triggers, and SQL summary views.
- `supabase/migrations/20260518032500_add_game_service_and_turn_length.sql`
  Migration for the `service` and `turn_length` game fields plus the updated live RPC signature and existing-game backfill.
- `supabase/review_consistency_patch.sql`
  Historical single-use live-database patch for winner consistency enforcement, `number_of_players` sync, and one-time backfill of existing inconsistencies; not meant for regular reuse.
- `supabase/create_game_with_participants_patch.sql`
  Historical single-use patch script for the transactional Add Game RPC and related `service`/`turn_length` fields; now redundant with canonical migrations and `schema.sql`.
- `supabase/migrations/20260518184620_add_summary_aggregation_views.sql`
  Migration for `numbered_games`, `dashboard_summary`, `commander_summary_entries`, `player_directory_entries`, and `player_page_summary` views.
- `supabase/migrations/20260518190426_set_function_search_paths.sql`
  Migration that pins `search_path` for existing public trigger/RPC functions.

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
- Live Supabase CLI validation confirmed:
  - `public.create_game_with_participants(...)` exists on the linked project
  - `anon` and `authenticated` both have `EXECUTE` on the function
  - remote migration `20260518030151` is recorded as applied
- Live Supabase validation for the new game fields confirmed:
  - `games.service` exists as `text`
  - `games.turn_length` exists as `integer`
  - `public.create_game_with_participants(...)` now includes `p_service` and `p_turn_length`
  - all 8 saved games were backfilled to `service = 'Convoke'`
  - all 8 saved games were backfilled to `turn_length = 9`
  - no saved games remain with null `service` or null `turn_length`
- Live Supabase validation after the consistency patch confirmed:
  - the trigger `trg_sync_game_participant_count` exists
  - winner inconsistency count is `0`
  - player-count inconsistency count is `0`
- Live Supabase validation after the summary-view migration confirmed:
  - remote migration `20260518184620` is recorded as applied
  - `dashboard_summary` returns `8` games, `26` commanders, and `24` players
  - `numbered_games` returns `8` games numbered from `1` through `8`
  - `player_page_summary` returns `21` history-backed players, `20` history-backed commanders, and `8` wins
- Live Supabase validation after function hardening confirmed:
  - remote migration `20260518190426` is recorded as applied
  - a follow-up advisor rerun was blocked by Supabase temp-role authentication failures and a temporary circuit breaker

## Known Caveats

- The app still uses broad public Supabase access with permissive RLS for this no-login setup.
- Player identity is still case-sensitive at the database level by design, so differently cased names remain distinct players.
- History and Players filters are URL-backed client filters rather than server-side filtered queries.
- The repo still contains `src/pages/CommandersPage.tsx`, but the route now redirects to home and the page is no longer exposed in navigation.

## TODO Notes

- Add a first-kill field or selector.
- Add a died-alone selector.
- Decide whether to archive or delete historical single-use SQL patch files:
  - `supabase/create_game_with_participants_patch.sql`
  - `supabase/review_consistency_patch.sql`
- Rerun Supabase advisors later after the temporary linked-project auth/circuit-breaker issue clears, and confirm only the intentional permissive no-login RLS warnings remain.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
