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
- Scryfall commander autocomplete
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
4. Commander fields use Scryfall autocomplete.
5. The user can select a winner and win condition.
6. The game appears in Game History.
7. The Dashboard shows commander win rates, turn-order advantage, date trends, and rolling averages.
8. The app works on a mobile browser.
9. The app can be deployed to Vercel with environment variables.
