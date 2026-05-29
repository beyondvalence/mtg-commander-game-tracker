# MTG Commander Game Tracker

React + TypeScript + Vite + Tailwind + Supabase app for logging multiplayer Commander games, reviewing history, and tracking player stats — scoped to named pods of players.

## Features

- **Auth:** Email/password + Google OAuth. All routes protected.
- **Pods:** Named groups with invite-code join flow. Games, stats, and player suggestions are pod-scoped. Pod admins create/edit games.
- **Add Game:** Multi-seat entry — bracket, date, service, notes, killed-first, winner. Commander autocomplete via Scryfall (partner/background supported). Player autocomplete from pod members' display names.
- **History:** Filterable by player, bracket, win condition. Inline editing for bracket, win condition, notes, winner, and player display names (rename triggers merge if name matches existing player).
- **Players:** Pod stat cards — games, wins, win rate, commander tiles. URL-backed filter.
- **Profile (`/me`):** Set your display name to link your auth identity to your game history. Changing your name updates history in-place; merging into an existing name fully relinks participations.

## Data Model

Key tables:

| Table | Purpose |
|-------|---------|
| `players` | `display_name` (editable), `user_id` (creator), `linked_user_id` (auth identity anchor, unique) |
| `commanders` | Cached Scryfall metadata; owned by the participant's `linked_user_id` |
| `games` | Pod-scoped game record; `winner_player_id` + `winner_participant_id` |
| `game_participants` | Seat, commander refs, `is_winner`, `killed_first` |
| `pods` | Name, invite code, creator |
| `pod_members` | `(pod_id, user_id)` membership + role (admin/member) |
| `profiles` | `player_id` — which player the auth user has claimed |

Views: `numbered_games`, `player_directory_entries`, `player_page_summary`, `dashboard_summary`.

Winner consistency enforced by `trg_enforce_game_winner_consistency_from_participants` (AFTER ROW trigger on `game_participants`) + `set_game_winner` RPC.

## Setup

1. Copy `.env.example` to `.env`, fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. `npm install`
3. `npx supabase db push` (apply all migrations)
4. `npm run dev`

## Commands

```bash
npm run dev       # dev server — http://localhost:5173
npm run build     # type-check + production build
npm test          # Vitest unit tests
npx supabase db push  # apply migrations to remote DB
```
