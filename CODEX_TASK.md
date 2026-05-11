# Codex Implementation Task

Read `SPEC.md` and implement the MVP for the MTG Commander Tracker.

## Build Requirements

Use:

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Recharts
- React Hook Form
- TanStack Table
- Scryfall API autocomplete
- Vercel deployment compatibility

## Required Pages

Create these pages:

- Login
- Dashboard
- Add Game
- Game History
- Commanders
- Players

## Required Features

Implement:

- Supabase email/password login
- Protected authenticated layout
- Logout
- Scryfall commander autocomplete with strict Commander-eligibility filtering and documented fallback behavior
- Single commander support
- Partner/background/secondary commander support
- Variable player count with default of 4
- Winner selected by player and commander/commander pair
- Optional game duration
- Plaintext notes
- Win condition dropdown
- Game history table
- Edit game
- Delete game
- Duplicate game setup
- Commander win-rate chart
- Commander-pair win-rate chart
- Turn-order advantage chart
- Date trend chart
- Rolling average win-rate chart with dropdown for last 5, 10, 20, and custom number
- Mobile-responsive layout

## Database

Use `schema.sql` as the starting schema.

All user-owned data must be protected with Row Level Security using `auth.uid() = user_id`.

## Implementation Notes

- Keep code readable and modular.
- Create reusable components for layout, form fields, commander autocomplete, charts, and tables.
- Keep app deployable to Vercel.
- Use `.env.example` as the environment variable template.
- Do not hardcode Supabase keys.
- Do not require a custom backend for MVP.
- Game create/update operations must be transactional so `games.winner_participant_id`, `games.winner_player_id`, and `game_participants.is_winner` are written atomically and remain synchronized.

## Suggested Folder Structure

```text
src/
  components/
    CommanderAutocomplete.tsx
    Layout.tsx
    ProtectedRoute.tsx
    charts/
    forms/
  lib/
    supabase.ts
    scryfall.ts
    analytics.ts
  pages/
    LoginPage.tsx
    DashboardPage.tsx
    AddGamePage.tsx
    GameHistoryPage.tsx
    CommandersPage.tsx
    PlayersPage.tsx
  types/
    database.ts
    app.ts
```

## Acceptance Criteria

The app is complete when:

1. A user can sign up, sign in, and sign out.
2. A user can add a Commander game with 2+ players, defaulting to 4.
3. Each player can have a primary commander and optional secondary commander.
4. Commander fields use Scryfall autocomplete with strict default filtering for Commander-eligible cards and a fallback query when strict search returns no results.
5. Autocomplete results are relevance-ranked so exact and prefix name matches appear before looser text matches.
6. Persisted commander selections include, at minimum, Scryfall card ID, card name, image URL (if present), color identity (if present), type line (if present), and oracle text (if present).
7. The user can select a winner and win condition.
8. The game appears in Game History.
9. The Dashboard shows commander win rates, turn-order advantage, date trends, and rolling averages.
10. Edge-case legal commanders are supported without false exclusion, including commander + Background pairings, partner-family pairings, and legal non-creature commanders that explicitly say they can be your commander.
11. The app works on a mobile browser.
12. The app can be deployed to Vercel with environment variables.


## Deterministic Analytics Requirements

Implementation must follow `SPEC.md` section "Deterministic Analytics Semantics" exactly.

Required implementation guarantees:

1. Encode deterministic definitions for each chart:
   - commander win rate,
   - commander pair win rate,
   - turn-order advantage,
   - date trends,
   - rolling average.
2. Enforce deterministic rules for:
   - grouping keys,
   - denominator and numerator semantics,
   - null/unknown handling,
   - tie/multi-winner handling,
   - duplicate row deduplication,
   - day/week/month bucket rules and timezone basis.
3. Filter behavior must be deterministic:
   - AND across filters,
   - OR within multi-select filter values,
   - defined defaults on initial load,
   - reset restores defaults without changing timezone.
4. Add automated acceptance checks (unit tests or fixture-driven checks) covering at least two synthetic datasets equivalent to the examples in `SPEC.md` and asserting expected outputs.
