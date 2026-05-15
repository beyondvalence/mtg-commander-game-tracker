# Project Context

## Current App State

- The app is a no-login MTG Commander tracker backed directly by a live Supabase project.
- Navigation uses a left sidebar with a persisted light/dark theme toggle.
- The dashboard and history pages read live data from Supabase through `src/lib/gameRecords.ts`.
- The Add Game page supports multi-seat entry, renders four-player pods in a 2x2 grid, and now supports two-card commander setups.
- Each player seat includes commander art placeholders, with stacked hoverable art for partner and background pairings.

## Recent Work

- Added commander image placeholders and staggered two-card art stacks on the Add Game page.
- Added secondary commander selection and persistence for partner-style pairs and commander-plus-background pairings.
- Improved Scryfall parsing so cards with face-based image data still render commander art correctly.
- Seeded the connected Supabase project with 3 sample games for dashboard and history testing.
- Fixed the `enforce_game_winner_consistency()` trigger so `games` inserts resolve the correct game id.
- Fixed the dashboard/history Supabase read to explicitly use `game_participants!game_participants_game_id_fkey`, avoiding PostgREST ambiguity after `winner_participant_id` was added.

## Recent Commits

- `ac29db7` - `Add sidebar theme toggle and live game tracking UI`
- `a504d6d` - `Convert tracker to no-login Supabase app`
- `cabf2a0` - `Add game save flow and upgrade Vite tooling`

## Key Files

- `src/pages/AddGamePage.tsx`
  Multi-seat game entry, secondary commander logic, and save flow.
- `src/components/CommanderAutocomplete.tsx`
  Commander/background autocomplete behavior and controlled input state.
- `src/lib/scryfall.ts`
  Scryfall search helpers and card-to-app mapping.
- `src/lib/gameRecords.ts`
  Shared Supabase reads for dashboard and history.
- `src/index.css`
  Theme variables plus commander placeholder/card-stack styling.
- `schema.sql`
  Current Supabase schema, including winner consistency trigger logic.

## Live Data Snapshot

- The connected Supabase project currently contains 3 sample games and 11 participant rows.
- Sample data includes both 3-player and 4-player games.
- Sample data includes a partner pairing so the two-card commander UI can be exercised immediately.

## Validation Status

- `npm test -- --run` passes with the current worktree.
- `npm run build` passes with the current worktree.
- The live dashboard query was rechecked against Supabase and returns game rows successfully.

## Known Caveats

- The current no-login Supabase setup still exposes app data broadly through public client access and permissive RLS policies.
- Game creation still happens as multiple client-side writes rather than a single transactional RPC.
- Sample data was inserted directly into the linked live Supabase project rather than through a reusable seed script.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
