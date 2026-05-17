# MTG Commander Game Tracker

A no-login MTG Commander tracker built with React, Vite, TypeScript, Tailwind, and Supabase. The app is designed for quickly logging multiplayer Commander games, reviewing history, and browsing player-level stats from a single shared game dataset.

## Current Features

- Branded `PodTracker` top navigation with quick access to Home, Add Game, History, and Players
- `Pod Highlights` home page with live game, player, and commander totals
- Deep links from the home page into specific History entries
- Add Game flow with:
  - Bracket, date, seats, and finished-state controls in one compact row
  - Player-name autocomplete from saved history
  - Commander autocomplete via Scryfall
  - Support for partner/background-style secondary commanders
  - Centered commander art with arrow-based switching for two-card setups
  - Optional unfinished games
  - Game notes with a 500-character limit and live character count
- Game History with:
  - Filters for player, bracket, and win condition
  - Inline editing for bracket, win condition, notes, and winner
  - Notes editing with a 500-character limit and live character count
  - Clickable player names that jump to the Players page with a prefilled filter
  - Clickable commander names and art linking to Scryfall
- Players page with:
  - Summary stat cards derived from saved game history
  - URL-backed filtering by player or commander text
  - Clear-filter control in the search bar
  - Player cards that link back into filtered History results

## Data Model

The app currently stores data directly in Supabase using:

- `players`
  - `id uuid primary key default gen_random_uuid()`
  - unique player names
- `commanders`
  - cached Scryfall card metadata for selected commanders
- `games`
  - `id uuid primary key default gen_random_uuid()`
  - `played_at`
  - `number_of_players`
  - `bracket`
  - `win_condition`
  - `notes`
  - `winner_player_id`
  - `winner_participant_id`
- `game_participants`
  - seat order
  - primary/secondary commander references
  - per-seat winner state

Winner consistency is enforced through the shared `set_game_winner` database function plus database-side consistency triggers.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in the Supabase project URL and anon key.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

## Useful Commands

- `npm run dev`
- `npm run build`
- `npm test -- --run`

## Notes

- The current app uses a no-login setup with broad public Supabase access.
- Game creation still happens through multiple client-side writes instead of a single transactional RPC.
- The old `CommandersPage.tsx` file still exists in the repo, but it is no longer part of active navigation.
