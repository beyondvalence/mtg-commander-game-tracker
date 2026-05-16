# Project Context

## Current App State

- The app is a no-login MTG Commander tracker backed directly by a live Supabase project.
- Navigation uses a left sidebar with a persisted light/dark theme toggle.
- The dashboard, history, and players pages all read live data from Supabase through `src/lib/gameRecords.ts`.
- The Add Game page supports multi-seat entry, optional game titles, bracket selection, and two-card commander setups for partner/background-style pairings.
- The Game History page supports inline title editing, player-name filtering, per-seat commander thumbnails, and bracket display for each saved game.
- The Players page now renders one tile per unique player with search by player name or commander name.

## Recent Work

- Added `games.bracket` support to the schema, Add Game flow, Game History display, shared game reads, and sample seed data.
- Applied the `games.bracket` schema update directly to the linked Supabase project and verified the live column/default/check constraint through the Supabase Management API.
- Added a compatibility fallback so localhost still reads and writes games against older schemas that do not yet expose the `bracket` column.
- Added optional `games.title` support to the schema, Add Game flow, and Game History page.
- Seeded the live Supabase project with 3 additional four-player sample games using real Scryfall commander metadata.
- Added `scripts/seedSampleGames.mjs` for repeatable sample data inserts.
- Added `scripts/backfillCommanderImages.mjs` and repaired missing commander art in the live project.
- Reworked Game History to show each game's players in a 2x2 grid for four-player pods, with right-aligned commander thumbnails and a player filter.
- Replaced the Players placeholder page with searchable live player tiles and commander art summaries.
- Removed the extra top-level “connected Supabase project” banner from the main layout.

## Recent Commits

- `ef99e0e` - `Add commander card previews and refresh project context`
- `ac29db7` - `Add sidebar theme toggle and live game tracking UI`
- `a504d6d` - `Convert tracker to no-login Supabase app`
- `cabf2a0` - `Add game save flow and upgrade Vite tooling`

## Key Files

- `src/pages/AddGamePage.tsx`
  Multi-seat game entry, title capture, bracket selection, secondary commander logic, and save flow.
- `src/pages/GameHistoryPage.tsx`
  History list, inline title editing, player filtering, per-seat commander thumbnails, and bracket display.
- `src/pages/PlayersPage.tsx`
  Searchable player directory with per-player commander tiles and summary stats.
- `src/lib/gameRecords.ts`
  Shared Supabase reads plus numbered game and player-directory aggregation helpers, including bracket compatibility fallback.
- `src/index.css`
  Theme variables plus commander layout styling for add-game, history, and player tiles.
- `schema.sql`
  Current Supabase schema, including `games.title`, `games.bracket`, and winner consistency trigger logic.
- `scripts/seedSampleGames.mjs`
  Live sample-game seed script with bracket values for seeded pods.
- `scripts/backfillCommanderImages.mjs`
  Live repair script for missing commander image URLs.

## Live Data Snapshot

- The connected Supabase project currently contains 6 games, 23 participant rows, 21 commanders, and 19 players.
- 5 saved games are four-player pods.
- 3 saved games include a secondary commander pairing.
- All currently saved games have a non-null `bracket` value, with the existing live rows backfilled to the default bracket `3`.
- Live commander image backfill has been completed, and saved game participants currently resolve commander artwork successfully.

## Validation Status

- `npm test -- --run` passes with the current worktree.
- `npm run build` passes with the current worktree.
- Live Supabase reads were rechecked for counts, bracket presence, and recent game payloads after the latest bracket work.
- The linked Supabase project now reports `public.games.bracket` as `integer`, `NOT NULL`, default `3`, with a `1..5` check constraint.

## Known Caveats

- The current no-login Supabase setup still exposes app data broadly through public client access and permissive RLS policies.
- Game creation still happens as multiple client-side writes rather than a single transactional RPC.
- The live database currently contains historical commander rows with placeholder `scryfall_id` values, even though missing artwork has been repaired.

## TODO Notes

- Add a game-service field or selector for `paper`, `Convoke`, or `Spelltable`.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
