-- Enforce NOT NULL on pod_id now that all rows are backfilled.
-- If this migration fails, re-run the backfill (migration 003) first.

alter table public.games
  alter column pod_id set not null;

alter table public.game_participants
  alter column pod_id set not null;
