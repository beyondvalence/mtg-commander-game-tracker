# Project Context

## Current App State

- The app is an owner-only authenticated MTG Commander tracker backed directly by a live Supabase project.
- Supabase Auth email/password is enabled in-app with sign in, sign up, password reset, persistent browser sessions, protected routes, and logout.
- Google OAuth sign-in is fully operational end-to-end: UI, Google Cloud OAuth client, and Supabase Dashboard provider are all configured and validated.
- Navigation now uses a compact horizontal top bar with a reusable branded `PodTracker` logo, a highlighted `Add Game` nav action, a `Pod` nav link for pod/player stats, logout, and a theme button on the right.
- The main active pages are Login, Dashboard, Add Game, Game History, and Pod Stats.
- Dashboard now surfaces compact live stat cards, a top-row `Add Game` tile, and clickable recent-game rows with compact metadata, seat-order summaries, and winner badges.
- Add Game supports optional unfinished games, reusable win-condition suggestions, case-sensitive player-name autocomplete matching, player-specific commander suggestions, partner/background-style secondary commanders, centered commander art, one-at-a-time partner/background carousel controls, a collapsed-by-default notes section behind a caret toggle, and finished-game-only `service` plus `turn length` selectors.
- Game History supports inline game editing for bracket, win condition, notes, and winner selection, with winner changes applied through the shared `set_game_winner` database function, plus seat-card art alignment that stays visually consistent when some players have two commanders and case-sensitive player filtering.
- Pod Stats renders live player tiles plus SQL-backed summary stat cards derived from saved history, along with URL-backed, case-sensitive filtering.

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
- Archived historical single-use SQL patch artifacts under `supabase/archive/` and confirmed linked-project Supabase advisors now complete after the prior temporary auth/circuit-breaker failure.
- Implemented the v0.2 owner-only Supabase Auth flow with `/login`, sign in, sign up, forgot-password/reset handling, an auth/session provider, protected routes, and logout in the authenticated layout.
- Added owner-backed RLS migrations that create `profiles`, add required `user_id` columns to app data tables, backfill existing rows to owner UUID `673b2a37-1799-4fcc-9dd2-d6598d36ee4b`, replace permissive policies with `to authenticated` owner policies, update game RPCs to require `auth.uid()`, and remove inherited anonymous function execution.
- Applied the auth/RLS migrations to the linked Supabase project and verified anonymous users no longer have public schema, table, or game RPC access while authenticated users retain the required app access.
- Shared the PodTracker logo between the app shell and auth page, made `/login` respect the same persisted dark/light theme as the home page, renamed the `Players` nav link to `Pod`, and changed the Players page title to `Pod Stats`.
- Added the v0.3 Google sign-in spec and implemented the `/login` Google OAuth button using Supabase `signInWithOAuth`, while preserving existing email/password sign-in, signup, forgot-password, and reset-password flows.
- Completed Google OAuth provider setup: configured Google Cloud OAuth consent screen and Web application client, added authorized JavaScript origins and Supabase callback redirect URI, enabled Google provider in Supabase Dashboard with Client ID and Secret, added Supabase redirect allow-list entries for local dev and production, and validated the full live sign-in round-trip.

## Current Session Summary

- Created `spec/spec-v0.3-google.md` with the Google OAuth plan, dashboard setup notes, account model, security boundaries, and test plan.
- Added `signInWithGoogle(redirectTo)` to `src/lib/auth.tsx`, using Supabase `signInWithOAuth({ provider: 'google', options: { redirectTo } })`.
- Added a `Continue with Google` action to `/login` for sign-in and sign-up modes, with separate OAuth loading state and immediate error handling.
- Kept existing email/password sign-in, email/password signup, forgot-password, reset-password, protected routing, logout, and RLS behavior unchanged.
- Added Google auth button/divider styling in `src/index.css`.
- Verified `npm test -- --run` and `npm run build` pass.
- Configured Google Cloud OAuth consent screen and Web application client for PodTracker.
- Added authorized JavaScript origins (`http://127.0.0.1:5173`, `http://localhost:5173`, production domain) and Supabase callback URL as authorized redirect URI in Google Cloud.
- Enabled Google provider in Supabase Dashboard with Client ID and Client Secret.
- Added Supabase redirect allow-list entries for local dev origins and production.
- Validated live Google sign-in round-trip end-to-end.

## Key Files

- `src/pages/AddGamePage.tsx`
  Add Game form state, finished-game toggle behavior, case-sensitive player suggestions, commander selection, seat-card art carousel behavior, collapsible notes capture, `service` and `turn length` selectors, and save flow.
- `src/pages/GameHistoryPage.tsx`
  Filtered history list, inline edit mode for bracket/win condition/notes, split game-card headers, service/turn-length metadata display, case-sensitive player filtering, seat-card winner selection, art alignment spacing, player-to-Players navigation, and Scryfall links.
- `src/pages/PlayersPage.tsx`
  Pod Stats page title, player summary cards, URL-backed case-sensitive player/commander filtering, player-to-history navigation, and commander-link rendering.
- `src/pages/LoginPage.tsx`
  Supabase Auth UI for Google OAuth, sign in, sign up, forgot-password email, reset-password update, persisted-theme application, and auth-page PodTracker branding.
- `src/lib/auth.tsx`
  Session provider built around `supabase.auth.getSession()` and `onAuthStateChange`, exposing current user/session/loading state plus Google OAuth sign-in and sign out.
- `src/components/ProtectedRoute.tsx`
  Route guard that blocks unauthenticated app access and redirects to `/login`.
- `src/components/PodTrackerLogo.tsx`
  Shared PodTracker mark/wordmark component used by the authenticated top bar and auth page.
- `src/lib/theme.ts`
  Shared persisted light/dark theme helpers used by both `/login` and the authenticated layout.
- `src/lib/gameRecords.ts`
  Shared reads for dashboard/history/player summaries plus the `setGameWinner` and `createGameWithParticipants` RPC wrappers, including `service` and `turn_length` support.
- `src/pages/DashboardPage.tsx`
  Compact home-page stat cards, top-row `Add Game` tile, and recent-game summaries with seat-order and winner context.
- `src/lib/scryfall.ts`
  Commander search helpers and the shared Scryfall URL builder.
- `src/components/Layout.tsx`
  Protected top navigation shell, shared branded logo, highlighted `Add Game` nav treatment, `Pod` stats link, logout, and theme menu.
- `src/index.css`
  App-wide layout plus the shared visual language for Dashboard, Add Game, History, Pod Stats, auth forms, commander art stages, and notes panels.
- `schema.sql`
  Current schema plus the corrected `set_game_winner` function, the transactional `create_game_with_participants` RPC, `games.service` and `games.turn_length`, stricter winner consistency enforcement, participant-count sync triggers, and SQL summary views.
- `supabase/migrations/20260518032500_add_game_service_and_turn_length.sql`
  Migration for the `service` and `turn_length` game fields plus the updated live RPC signature and existing-game backfill.
- `supabase/archive/review_consistency_patch.sql`
  Historical single-use live-database patch for winner consistency enforcement, `number_of_players` sync, and one-time backfill of existing inconsistencies; not meant for regular reuse.
- `supabase/archive/create_game_with_participants_patch.sql`
  Historical single-use patch script for the transactional Add Game RPC and related `service`/`turn_length` fields; now redundant with canonical migrations and `schema.sql`.
- `supabase/migrations/20260518184620_add_summary_aggregation_views.sql`
  Migration for `numbered_games`, `dashboard_summary`, `commander_summary_entries`, `player_directory_entries`, and `player_page_summary` views.
- `supabase/migrations/20260518190426_set_function_search_paths.sql`
  Migration that pins `search_path` for existing public trigger/RPC functions.
- `supabase/migrations/20260521014852_add_owner_auth_rls.sql`
  Owner-only auth/RLS migration that creates `profiles`, adds and backfills `user_id`, swaps table policies to authenticated owner checks, updates game RPCs to require `auth.uid()`, and revokes anonymous table/RPC access.
- `supabase/migrations/20260521020358_revoke_public_function_access.sql`
  Follow-up grant hardening that removes inherited `PUBLIC` function execution and confirms only `authenticated` can execute app RPCs.
- `spec/spec-v0.3-google.md`
  Detailed plan for adding Google sign-in, including Supabase/Google Cloud setup, account model, security boundaries, and validation scenarios.

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
  - a follow-up linked-project advisor rerun now completes successfully
  - warning-level/security advisor output previously contained only the then-intentional permissive no-login RLS policy warnings
  - info-level advisor output also reports optional performance work for unindexed foreign keys on `games` and `game_participants`
- Live Supabase validation after auth/RLS migration confirmed:
  - remote migrations `20260521014852` and `20260521020358` are recorded as applied
  - owner UUID `673b2a37-1799-4fcc-9dd2-d6598d36ee4b` exists in `auth.users`
  - existing rows are fully owner-backed: 24 players, 26 commanders, 8 games, 31 game participants, and zero null `user_id` rows
  - RLS is enabled on `profiles`, `players`, `commanders`, `games`, and `game_participants`
  - `anon` has no public schema usage, no `games` SELECT, and no game RPC EXECUTE
  - `authenticated` has required game table and `create_game_with_participants` RPC access
  - linked security advisors report only leaked password protection disabled
- v0.3 Google sign-in validation confirmed:
  - `npm test -- --run` passes
  - `npm run build` passes
  - Google Cloud OAuth client configured with correct origins and redirect URI
  - Supabase Dashboard Google provider enabled with Client ID and Secret
  - Supabase redirect allow-list covers local dev and production
  - live Google sign-in round-trip validated end-to-end

## Known Caveats

- Supabase Auth leaked password protection is still disabled in Dashboard and should be enabled before real use.
- Public signup exists in the UI; Dashboard Auth settings determine whether email confirmation is required and whether signup remains open.
- Google sign-in is fully configured and live; the only remaining security hardening is enabling Supabase Auth leaked password protection.
- Player identity is still case-sensitive at the database level by design, so differently cased names remain distinct players.
- History and Pod Stats filters are URL-backed client filters rather than server-side filtered queries.
- The repo still contains `src/pages/CommandersPage.tsx`, but the route now redirects to home and the page is no longer exposed in navigation.

## TODO Notes

- Enable Supabase Auth leaked password protection in Dashboard.
- Add a first-kill field or selector.
- Add a died-alone selector.
- Consider adding indexes for the advisor-reported unindexed foreign keys on `games` and `game_participants`.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
- `src/mtg-commander-game-tracker.code-workspace`
