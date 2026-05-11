# MTG Commander Game Tracker

MVP scaffold implementing the SPEC/CODEX_TASK with:
- React + Vite + TypeScript + Tailwind
- Supabase client wiring and env template
- Auth-gated app shell routes
- Required pages (Login, Dashboard, Add Game, Game History, Commanders, Players)
- Scryfall commander autocomplete with strict query and broadened fallback labeling
- Deterministic analytics utility functions and fixture tests

## Setup

1. Copy `.env.example` to `.env` and fill Supabase values.
2. Install dependencies: `npm install`
3. Run: `npm run dev`

## Notes

Due to environment package registry restrictions, dependency installation may fail in restricted CI environments.
