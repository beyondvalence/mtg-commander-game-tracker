# MTG Commander Tracker

A private, mobile-friendly web app for tracking Magic: The Gathering Commander games.

## Goal

Track Commander games, players, commanders, partner/background commander pairs, turn order, wins/losses, win conditions, dates, optional duration, and plaintext notes. The app should provide dashboard visualizations for commander win rates, turn-order advantage, date trends, and rolling average win rates.

## Recommended Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Recharts
- React Hook Form
- TanStack Table
- Scryfall API autocomplete
- Vercel deployment

## Core Pages

- Login
- Dashboard
- Add Game
- Game History
- Commanders
- Players

## Local Setup

```bash
npm create vite@latest mtg-commander-tracker -- --template react-ts
cd mtg-commander-tracker
npm install
npm install @supabase/supabase-js recharts react-hook-form @tanstack/react-table lucide-react
npm install -D tailwindcss postcss autoprefixer
```

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Add your Supabase values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run locally:

```bash
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. Enable email/password auth.
3. Open the Supabase SQL editor.
4. Run `schema.sql`.
5. Copy the project URL and anon key into `.env.local`.

## Deployment

Use Vercel:

1. Push this project to GitHub.
2. Import the repo in Vercel.
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

## Codex Task

See `CODEX_TASK.md` for the recommended prompt to give Codex.
