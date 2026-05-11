# MTG Commander Tracker Product Spec

## 1. Product Summary

Build a private, mobile-friendly web app for tracking Magic: The Gathering Commander games. The app will be used by one person initially, but should support login so the user can access it from a mobile browser and keep game history synced through the cloud.

The app tracks:

- Commander card or commander pair
- Partner commanders, backgrounds, and similar two-card commander setups
- Turn order
- Winner/loss results
- Date of game
- Optional game duration
- Plaintext notes
- Win condition
- Commander win rates
- Turn-order advantage
- Date trends
- Rolling average win rates

## 2. Target User

Single private user for MVP.

The app should still use authentication so the user can access the same data from desktop and mobile browsers.

## 3. Access Model

Use Supabase Auth.

MVP auth:

- Email/password login
- Logout
- Protected app routes

Optional later:

- Magic link login
- Google login
- Multi-user support

## 4. Platform

Responsive web app.

Must work well on:

- Desktop browser
- iPhone mobile browser
- Android mobile browser

Mobile UX requirements:

- Mobile-first Add Game screen
- Large tap targets
- Responsive charts
- Collapsible dashboard filters
- Sticky save button on Add Game page
- Minimal horizontal scrolling

## 5. Core Pages

### 5.1 Login

Purpose:

Allow the user to sign in privately.

Features:

- Email/password sign in
- Email/password sign up if no account exists
- Logout from authenticated layout
- Redirect unauthenticated users to login

### 5.2 Dashboard

Purpose:

Show visual analytics and filters.

Charts:

- Commander win-rate chart
- Commander-pair win-rate chart
- Turn-order advantage chart
- Games played over time
- Rolling average win-rate chart
- Win condition breakdown

Filters:

- Date range
- Player
- Commander
- Commander pair
- Win condition
- Number of players
- Turn-order position
- Rolling average window

Rolling average options:

- Last 5 games
- Last 10 games
- Last 20 games
- Custom number

### 5.3 Add Game

Purpose:

Primary form for logging a Commander game.

Fields:

- Game date
- Optional game duration in minutes
- Number of players, default 4
- Turn order
- Player name for each seat
- Primary commander for each player
- Optional secondary commander / partner / background for each player
- Winning player
- Winning commander or commander pair
- Win condition
- Plaintext notes

Commander autocomplete:

- Use Scryfall API
- Default search must use a strict Commander-eligible query that returns only cards that can legally be chosen as a commander in normal Commander deck construction. The strict filter must include:
  - legendary creatures,
  - cards with explicit text that they can be your commander,
  - cards with `Partner`, `Friends forever`, `Choose a Background`, `Doctor's companion`, or `Create a Character` where applicable,
  - cards that are legal in Commander (`format:commander`).
- Background cards must be queried from Scryfall with a dedicated strict filter that only returns legal Background enchantments (`type:background format:commander`) for secondary commander selection.
- Fallback behavior: if a strict query for a specific field returns zero results, immediately retry with a broader Commander-legal query (still `format:commander`) and clearly mark results as "broadened" so the user understands why non-default matches are shown.
- Persist selected card metadata from Scryfall for every commander slot:
  - Scryfall card ID
  - Card name
  - Image URL if available
  - Color identity if available
  - Type line if available
  - Oracle text if available

Commander legality edge cases:

- Do not exclude legal non-creature commanders (for example, cards with "can be your commander" text).
- Do not exclude valid two-card commander configurations, including partner-family pairings and commander + Background combinations.
- For secondary commander fields, only allow pairings that are rules-compatible with the selected primary commander ability family (for example Partner with Partner, Background only when the primary card allows Background).
- If legality cannot be fully validated client-side, allow save with a warning instead of silently blocking valid uncommon commander cases.

Turn order:

- Each participant has a turn order position
- Default player count is 4
- Player count should be adjustable

Winner selection:

- Winner is selected by player
- Winning commander or commander pair is selected based on that player's selected commander(s)

### 5.4 Game History

Purpose:

Search, view, edit, delete, and duplicate previous games.

Table columns:

- Date
- Duration
- Number of players
- Turn order
- Players
- Commanders / commander pairs
- Winner
- Winning commander / pair
- Win condition
- Notes

Actions:

- View details
- Edit game
- Delete game
- Duplicate game setup

### 5.5 Commanders

Purpose:

Show individual commander and commander-pair performance.

Individual commander stats:

- Games played
- Wins
- Losses
- Win rate
- Last played
- Common partner/background

Commander pair stats:

- Pair name
- Games played
- Wins
- Losses
- Win rate
- Last played

Examples:

- Tymna the Weaver + Thrasios, Triton Hero
- Wilson, Refined Grizzly + Flaming Fist

### 5.6 Players

Purpose:

Show player performance.

Stats:

- Games played
- Wins
- Losses
- Win rate
- Most played commanders
- Best performing commanders
- Win rate by turn-order position

## 6. Data Model

Use Supabase PostgreSQL.

Every user-owned table should include:

- `id`
- `user_id`
- `created_at`
- `updated_at`, where useful

### 6.1 profiles

Stores app-level user profile information.

Fields:

- id uuid primary key references auth.users(id)
- display_name text
- created_at timestamptz
- updated_at timestamptz

### 6.2 players

Stores recurring player names.

Fields:

- id uuid primary key
- user_id uuid references auth.users(id)
- name text not null
- created_at timestamptz
- updated_at timestamptz

### 6.3 commanders

Stores commander cards selected from Scryfall.

Fields:

- id uuid primary key
- user_id uuid references auth.users(id)
- scryfall_id text
- name text not null
- image_url text
- color_identity text array
- type_line text
- oracle_text text
- created_at timestamptz
- updated_at timestamptz

### 6.4 games

Stores one Commander game.

Fields:

- id uuid primary key
- user_id uuid references auth.users(id)
- played_at date not null
- duration_minutes integer nullable
- number_of_players integer not null default 4
- winner_player_id uuid references players(id), optional compatibility column
- winner_participant_id uuid references game_participants(id)

Winner representation (canonical):

- Canonical winner is `games.winner_participant_id`.
- `game_participants.is_winner` is retained as a synchronized mirror for query ergonomics.
- `winner_player_id` is retained only for compatibility and must equal the winner participant's `player_id`.
- Synchronization rules:
  - Exactly one participant row per game must have `is_winner = true`.
  - That row's `id` must equal `games.winner_participant_id`.
  - The winner participant must belong to the same game (`game_participants.game_id = games.id`).
  - If `winner_player_id` is non-null, it must equal the winner participant's `player_id`.
- win_condition text not null
- notes text
- created_at timestamptz
- updated_at timestamptz

### 6.5 game_participants

Stores each player/deck in a game.

Fields:

- id uuid primary key
- user_id uuid references auth.users(id)
- game_id uuid references games(id) on delete cascade
- player_id uuid references players(id)
- turn_order_position integer not null
- primary_commander_id uuid references commanders(id)
- secondary_commander_id uuid references commanders(id), nullable
- is_winner boolean default false
- created_at timestamptz
- updated_at timestamptz

## 7. Win Conditions

Initial dropdown options:

- Combat damage
- Commander damage
- Combo
- Mill
- Poison / infect
- Alternate win condition
- Concession
- Other

Future option:

- Custom win condition labels

## 8. Analytics Requirements

### 8.1 Commander Win Rate

Formula:

```text
commander wins / commander games played
```

Track both:

- Individual commander win rate
- Commander pair win rate

### 8.2 Turn-Order Advantage

Formula:

```text
wins from turn position / total games from that turn position
```

Example for 4-player games:

```text
Seat 1: 22%
Seat 2: 28%
Seat 3: 24%
Seat 4: 26%
```

Chart:

- Bar chart
- Default filtered to 4-player games
- Allow number-of-players filter

### 8.3 Date Trends

Track:

- Games played over time
- Wins over time
- Commander performance over time
- Player performance over time

Charts:

- Line chart
- Bar chart for games per week/month

### 8.4 Rolling Average Win Rate

Formula:

```text
rolling wins / selected rolling game window
```

Controls:

- Last 5 games
- Last 10 games
- Last 20 games
- Custom number

Filter by:

- Player
- Commander
- Commander pair
- Win condition
- Number of players

## 9. Technical Architecture

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- React Hook Form
- TanStack Table
- Recharts
- lucide-react icons

### Backend

- Supabase Auth
- Supabase PostgreSQL
- Row Level Security policies

### External API

- Scryfall API for card autocomplete

### Hosting

- Vercel

## 10. Environment Variables

Required frontend variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 11. MVP Build Order

1. Create React + Vite + TypeScript app
2. Install dependencies
3. Configure Tailwind CSS
4. Add Supabase client setup
5. Create Supabase database schema
6. Enable Row Level Security
7. Build auth pages and protected routes
8. Build app layout and navigation
9. Build Scryfall commander autocomplete component
10. Build Add Game page
11. Build Game History page
12. Build Dashboard page
13. Build Commanders page
14. Build Players page
15. Add mobile responsive polish
16. Deploy to Vercel

## 12. Non-Goals for MVP

Do not include in MVP unless explicitly requested later:

- Public sharing
- Multiplayer accounts
- Full decklists
- Card-by-card game actions
- Life total tracking
- Commander damage tracking during game
- Native mobile app
- Offline-first mode
