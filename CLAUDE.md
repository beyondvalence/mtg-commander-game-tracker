# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Style

At the start of every session, activate caveman full mode by invoking `/caveman full`. Terse responses, no filler, no pleasantries, fragments OK. Technical substance unchanged.

## Commands

```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Type-check + production build (tsc -b && vite build)
npm test             # Run Vitest tests once
npm run preview      # Preview production build locally
```

Run a single test file:
```bash
npx vitest run src/test/analytics.test.ts
```

Apply a Supabase migration:
```bash
npx supabase db push
```

## Architecture

**Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Supabase (Postgres + Auth), React Router v6.

**Auth model (v0.2+):** Supabase email/password auth with Google OAuth (v0.3). All routes except `/login` are wrapped in `ProtectedRoute`, which redirects unauthenticated users. `AuthProvider` (`src/lib/auth.tsx`) wraps the app and exposes `useAuth()` — it provides `user`, `session`, `isLoading`, `signInWithGoogle`, and `signOut`. The Supabase client is a singleton in `src/lib/supabase.ts`; it reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.

**Data layer:** `src/lib/gameRecords.ts` is the single file for all Supabase queries. It reads from several server-side views (`numbered_games`, `dashboard_summary`, `player_directory_entries`, `player_page_summary`) and calls two RPCs: `create_game_with_participants` (transactional game creation) and `set_game_winner`. Supabase's foreign-key join syntax (`commanders!game_participants_primary_commander_id_fkey`) is used to disambiguate multiple FK relationships to the same table.

**RLS:** All app tables (`players`, `commanders`, `games`, `game_participants`) have `user_id` columns gated by `auth.uid() = user_id` policies. Views use `security_invoker = true` to inherit base-table RLS. Anonymous access is fully revoked; only the `authenticated` role has access.

**Commander data:** `src/lib/scryfall.ts` queries the Scryfall API directly from the browser. `searchCommanders` tries a strict legendary-creature filter first, then falls back to `format:commander`. Results are cached as `commanders` rows in Supabase when a game is created.

**Analytics:** `src/lib/analytics.ts` contains pure, client-side analytics functions (`commanderWinRates`, `commanderPairWinRates`, `rollingWinRate`) that operate on `GameRecord[]`. These are unit-tested in `src/test/analytics.test.ts`.

**Routing:**
- `/` — Dashboard with pod highlights and recent games
- `/add-game` — Multi-seat game entry form
- `/history` — Filterable and inline-editable game log
- `/players` — Player stat cards with URL-backed filtering
- `/login` — Email/password + Google OAuth sign-in
- `/commanders` — Redirects to `/` (page removed but route kept to avoid broken links)

**Schema changes** go in `supabase/migrations/` as timestamped `.sql` files. Apply with `npx supabase db push`.

## Environment

Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/publishable key

The `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_SECRET` in `.env.example` are configured in the Supabase Dashboard's Google Auth provider, not consumed by the Vite app directly.

## Notes

- `CommandersPage.tsx` still exists in `src/pages/` but is not part of active navigation — its route redirects to `/`.
- Supabase join results for FK relationships return either an object or a single-element array depending on the query shape. `readSingleName` and `readSingleCommander` in `gameRecords.ts` normalize both forms.
- The `numbered_games` view adds a sequential `game_number` derived from `played_at` ordering; use it instead of querying `games` directly when display numbers are needed.
