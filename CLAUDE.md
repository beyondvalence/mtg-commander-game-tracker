# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## Session Style

Start every session: activate caveman full mode via `/caveman full`. Terse, no filler, no pleasantries, fragments OK. Technical substance unchanged.

## Commands

```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Type-check + production build (tsc -b && vite build)
npm test             # Run Vitest tests once
npm run preview      # Preview production build locally
```

Run single test file:
```bash
npx vitest run src/test/analytics.test.ts
```

Apply Supabase migration:
```bash
npx supabase db push
```

## Architecture

**Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Supabase (Postgres + Auth), React Router v6.

**Auth model (v0.2+):** Supabase email/password auth with Google OAuth (v0.3). All routes except `/login` wrapped in `ProtectedRoute`, redirects unauthenticated users. `AuthProvider` (`src/lib/auth.tsx`) wraps app, exposes `useAuth()` — provides `user`, `session`, `isLoading`, `signInWithGoogle`, `signOut`. Supabase client is singleton in `src/lib/supabase.ts`; reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.

**Data layer:** `src/lib/gameRecords.ts` — single file for all Supabase queries. Reads from server-side views (`numbered_games`, `dashboard_summary`, `player_directory_entries`, `player_page_summary`), calls RPCs: `create_game_with_participants` (transactional game creation), `set_game_winner`, `relink_participant_player` (rename/merge participant player atomically, handles winner-consistency trigger). Uses Supabase FK join syntax (`commanders!game_participants_primary_commander_id_fkey`) to disambiguate multiple FK relationships to same table.

**RLS:** All app tables (`players`, `commanders`, `games`, `game_participants`) have `user_id` columns gated by `auth.uid() = user_id` policies. Views use `security_invoker = true` to inherit base-table RLS. Anonymous access fully revoked; only `authenticated` role has access.

**Commander data:** `src/lib/scryfall.ts` queries Scryfall API from browser. `searchCommanders` tries strict legendary-creature filter first, falls back to `format:commander`. Results cached as `commanders` rows in Supabase on game creation.

**Analytics:** `src/lib/analytics.ts` — pure client-side functions (`commanderWinRates`, `commanderPairWinRates`, `rollingWinRate`) operating on `GameRecord[]`. Unit-tested in `src/test/analytics.test.ts`.

**Routing:**
- `/` — Dashboard with pod highlights and recent games
- `/add-game` — Multi-seat game entry form; disabled Save button shows hover tooltip listing incomplete required fields
- `/history` — Filterable and inline-editable game log; player names editable in edit mode (uses `relink_participant_player` RPC, supports renaming to existing player name via merge)
- `/players` — Player stat cards with URL-backed filtering (case-insensitive)
- `/me` — Profile page; user types name to create/link their player identity; shows stats, recent games, commander tiles
- `/login` — Email/password + Google OAuth sign-in
- `/commanders` — Redirects to `/` (page removed, route kept to avoid broken links)

**Player identity:** `profiles` table has `player_id uuid` FK to `players`. `/me` page upserts player by `(user_id, name)` and writes `profiles.player_id`. `fetchProfilePlayerId` / `createOrLinkPlayer` / `fetchPlayerById` / `fetchPlayerRecentGames` in `gameRecords.ts` support this flow. Standalone players (0 games) fall back to direct `players` table query in `fetchPlayerById`.

**Schema changes** go in `supabase/migrations/` as timestamped `.sql` files. Apply with `npx supabase db push`.

## Environment

Copy `.env.example` to `.env`, fill in:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/publishable key

`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_SECRET` in `.env.example` configured in Supabase Dashboard's Google Auth provider — not consumed by Vite app directly.

## Notes

- `CommandersPage.tsx` exists in `src/pages/` but not in active navigation — route redirects to `/`.
- Supabase join results for FK relationships return object or single-element array depending on query shape. `readSingleName` and `readSingleCommander` in `gameRecords.ts` normalize both forms.
- `numbered_games` view adds sequential `game_number` derived from `played_at` ordering; use instead of querying `games` directly when display numbers needed.
- `relink_participant_player` RPC uses SECURITY DEFINER with a null-intermediate 3-step sequence to satisfy `trg_enforce_game_winner_consistency_from_participants` (AFTER ROW trigger): null `games.winner_player_id` → update `game_participants.player_id` → restore `games.winner_player_id`.
- `<datalist>` for player rename suggestions in history page lives at the top of the JSX, outside all `overflow-hidden`/`overflow-x-auto` containers, so browser anchors the popup correctly to whichever input is active.
- Public signup is open in the UI by default; Supabase Dashboard Auth settings control whether email confirmation is required and whether signup is restricted.
- History and Players filters are URL-backed client-side filters, not server-filtered queries.
- `resolveInitialTheme()` in `src/lib/theme.ts` defaults to `'dark'` (intentional, ignores system `prefers-color-scheme`). Users who want light mode must toggle manually.

## Ignored Local Files

- `.agents/`
- `skills-lock.json`
- `src/mtg-commander-game-tracker.code-workspace`

## TODO

- Enable Supabase Auth leaked password protection in Dashboard.
- Add pod feature: named groups of players, invite-code join flow, pod-scoped game and stat views.