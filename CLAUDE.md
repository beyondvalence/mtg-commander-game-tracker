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

**Data layer:** `src/lib/gameRecords.ts` — single file for all Supabase queries. Reads from server-side views (`numbered_games`, `dashboard_summary`, `player_directory_entries`, `player_page_summary`), calls RPCs: `create_game_with_participants` (transactional game creation), `set_game_winner`, `relink_participant_player` (rename/merge participant player atomically, handles winner-consistency trigger), `update_player_display_name` (profile name change — see Player identity below). Uses Supabase FK join syntax (`commanders!game_participants_primary_commander_id_fkey`) to disambiguate multiple FK relationships to same table.

**RLS:** All app tables (`players`, `commanders`, `games`, `game_participants`) have `user_id` columns gated by `auth.uid() = user_id` policies. Pod members get additional SELECT policies on `games`, `game_participants`, and `commanders` scoped to shared pods. Views use `security_invoker = true` to inherit base-table RLS. Anonymous access fully revoked; only `authenticated` role has access.

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

**Player identity:** Two-column model on `players`:
- `user_id` — who created the record (game creator / pod admin). Used for RLS ownership and the `(user_id, display_name)` unique constraint.
- `linked_user_id uuid UNIQUE` — which auth user this player IS (set when a user claims a player on `/me`). The structural identity anchor.
- `display_name` — editable label, not a structural key.

`profiles.player_id` FK → `players.id` tracks each user's currently linked player. `createOrLinkPlayer` calls the `update_player_display_name` RPC (SECURITY DEFINER), which:
- **First time:** searches for an unlinked player with that display_name in the user's pods (adopts it if found, preserving history); else creates a new player.
- **Case A (new unique name):** UPDATE display_name in-place — all game history auto-reflects the change. Advisory lock prevents concurrent TOCTOU.
- **Case B (name matches existing):** full merge — relinks all `game_participants`, handles winner-consistency trigger via null-intermediate pattern, transfers `linked_user_id`. Searches across `user_id` namespaces for unlinked players in shared pods.

`fetchAddGamePlayerSuggestions(podId)` returns only pod members who have set their display_name (i.e., `linked_user_id` is set). `readSingleName` reads `display_name ?? name` — handles both player objects (`display_name`) and commander objects (`name`).

Commander records are stamped with the participant's `linked_user_id` (not the game creator's `user_id`) so each player owns their own commander rows. `pod_player_links` table was dropped — derivable via `players.linked_user_id`.

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
- `relink_participant_player` and `update_player_display_name` RPCs both use SECURITY DEFINER with a null-intermediate 3-step sequence to satisfy `trg_enforce_game_winner_consistency_from_participants` (AFTER ROW trigger): null `games.winner_player_id` → update `game_participants.player_id` → restore `games.winner_player_id`.
- `update_player_display_name` uses `pg_advisory_xact_lock` on `hash(owner_uid | display_name)` to serialize concurrent renames (same pattern as `demote_pod_member`).
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
- ~~Phase C: enforce display_name set before pod game creation (guard in `create_game_with_participants`).~~ Done.
- Phase D: display_name collision detection within a pod (two members, same name).
- Phase E: show "display name not set" warning in pod member list and `/me`.
- Join pod flow: redirect to home page with a modal confirmation showing the pod name and Join / Cancel buttons (instead of landing on a separate join page).