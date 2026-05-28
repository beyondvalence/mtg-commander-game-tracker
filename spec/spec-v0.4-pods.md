# spec-v0.4-pods.md

## Overview

Introduces a **pod** feature: named groups of players (Supabase auth users) sharing game history. Multiple users can join a pod via invite link. A user can be in multiple pods and switches between them via a dropdown. Games, players, and stats become pod-scoped. Only pod **admins** can add or edit games; **members** are read-only. Existing games are backfilled to a pod named `test-pod`.

---

## Requirements

### Pod Basics
- A pod has a unique UUID, a display name, and a UUID invite code (used in invite links)
- Any authenticated user can create a pod and becomes its admin
- Multiple users can join a pod via invite link (`/join/:inviteCode`)
- A user can be a member of multiple pods simultaneously
- A pod can have multiple admins

### Roles
| Role | Permissions |
|---|---|
| **admin** | Create games, edit game history, kick members, promote/demote members |
| **member** | View game history, dashboard, players (read-only) |

### Pod-Scoped Views
- Dashboard, Game History, Add Game, Players — all filtered by currently selected pod
- Pod switcher in nav bar; persisted to localStorage

### Cross-Pod Commander Suggestions
- When creating a game, commander suggestions for a player come from **all pods** the logged-in user is a member of (not just the current pod)
- `user_commanders` deck roster is user-scoped, not pod-scoped

### Profile Dropdown (top-right nav)
Replaces existing email/logout section. Contains:
1. **Profile** — player stats, recent games
2. **Account** — change display name
3. **Decks** — commanders from game history + manually addable via Scryfall search
4. **Pods** — list all pods, select active pod, create new pod, join via invite code; admin controls (kick/promote/demote)
5. **Sign Out**

### Decks
- Pre-seeded from commanders used in recorded game history
- Additional commanders manually addable (Scryfall search)
- Stored in `user_commanders` table (user-scoped, denormalized — no FK to `commanders`)

### Pod Creation (Premium Gate)
- Any user can create a pod today
- `app_config` table holds `pod_creation_enabled boolean` (default `true`)
- Future: flip to `false` via service_role to restrict to premium accounts

### Backfill
- All existing games, game_participants backfilled to `test-pod`
- Existing user becomes admin of `test-pod`

---

## Data Model

### New Tables

#### `pods`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `invite_code` | uuid UNIQUE DEFAULT gen_random_uuid() | used in invite URLs |
| `created_by` | uuid FK auth.users | |
| `created_at` | timestamptz | |

#### `pod_members`
| Column | Type | Notes |
|---|---|---|
| `pod_id` | uuid FK pods | |
| `user_id` | uuid FK auth.users | |
| `role` | text CHECK ('admin','member') DEFAULT 'member' | |
| `joined_at` | timestamptz | |
| PK | (pod_id, user_id) | |

#### `pod_player_links`
| Column | Type | Notes |
|---|---|---|
| `pod_id` | uuid FK pods | |
| `user_id` | uuid FK auth.users | |
| `player_id` | uuid FK players | |
| PK | (pod_id, user_id) | |

Links a pod member's auth account → their player record in that pod.

#### `user_commanders`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | |
| `scryfall_id` | text | nullable for custom cards |
| `name` | text NOT NULL | |
| `image_url` | text | |
| `color_identity` | text[] | |
| `added_at` | timestamptz | |
| UNIQUE INDEX | (user_id, scryfall_id) WHERE scryfall_id IS NOT NULL | |

#### `app_config`
| Column | Type | Notes |
|---|---|---|
| `key` | text PK | |
| `value` | jsonb NOT NULL | |

Seed: `('pod_creation_enabled', 'true')`

### Modified Tables

| Table | Change |
|---|---|
| `games` | Add `pod_id uuid NOT NULL FK pods` (nullable during migration, then NOT NULL) |
| `game_participants` | Add `pod_id uuid NOT NULL FK pods` (denormalized for RLS efficiency) |
| `players` | No change — stay user-scoped |
| `commanders` | No change — stay user-scoped |
| `profiles` | No change |

---

## RLS Changes

### `games` / `game_participants`
```sql
-- SELECT: owner OR any pod member
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM pod_members WHERE pod_id = [table].pod_id AND user_id = auth.uid()
))
-- INSERT/UPDATE: owner OR pod admin
WITH CHECK (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM pod_members WHERE pod_id = [table].pod_id AND user_id = auth.uid() AND role = 'admin'
))
```

### New tables
| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `pods` | pod member | owner | pod admin | — |
| `pod_members` | pod member | via SECURITY DEFINER RPC | pod admin | admin or self |
| `pod_player_links` | pod member | via SECURITY DEFINER RPC | — | — |
| `user_commanders` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `app_config` | authenticated | — | — | — |

---

## RPCs

### Updated

| RPC | Change |
|---|---|
| `create_game_with_participants` | Add `p_pod_id uuid` param (required); admin check; set pod_id on games + game_participants |
| `set_game_winner` | Add admin check (caller must be admin of game's pod) |
| `relink_participant_player` | Add admin check |

### New

| RPC | Signature | Behavior |
|---|---|---|
| `create_pod` | `(p_name text) → uuid` | Check `app_config.pod_creation_enabled`; insert pod; add caller as admin; link `profiles.player_id` to `pod_player_links` |
| `join_pod` | `(p_invite_code uuid) → uuid` | Resolve invite_code → pod_id; upsert pod_members (member); upsert pod_player_links; idempotent |
| `kick_pod_member` | `(p_pod_id, p_target_user_id) → void` | Admin-only; can't kick self; deletes pod_members + pod_player_links |
| `promote_pod_member` | `(p_pod_id, p_target_user_id) → void` | Admin-only; sets role = 'admin' |
| `demote_pod_member` | `(p_pod_id, p_target_user_id) → void` | Admin-only; blocks if last admin |
| `get_user_pods` | `() → TABLE(pod_id, pod_name, role, invite_code, member_count)` | All pods for `auth.uid()` |

All: `SECURITY DEFINER`, `SET search_path = ''`

---

## View / Function Changes

| View/Function | Change |
|---|---|
| `numbered_games` | Add `pod_id` to SELECT |
| `dashboard_summary` | Convert to RPC `get_pod_dashboard_summary(p_pod_id uuid)` |
| `player_directory_entries` | Add companion view `pod_player_directory_entries` (pod-scoped via `pod_player_links`) |
| `player_page_summary` | Convert to RPC `get_pod_player_page_summary(p_pod_id, p_player_id)` |
| `commander_summary_entries` | No change (cross-pod, user-scoped) |

---

## Migration Sequence

| File | Contents |
|---|---|
| `20260527000001_add_pods_core.sql` | New tables, RLS policies, new RPCs |
| `20260527000002_add_pod_id_to_games.sql` | Nullable pod_id on games/game_participants; indexes; updated views; `get_pod_dashboard_summary` |
| `20260527000003_backfill_test_pod.sql` | Create test-pod; add existing user as admin; backfill games, game_participants, user_commanders (transactional DO block) |
| `20260527000004_add_pod_id_not_null.sql` | Make pod_id NOT NULL on games and game_participants |
| `20260527000005_update_rpcs_pod_aware.sql` | Replace create_game_with_participants, set_game_winner, relink_participant_player with pod-aware versions |

---

## Frontend

### New Files
| File | Purpose |
|---|---|
| `src/contexts/PodContext.tsx` | `activePodId`, `userPods`, `isPodAdmin`, `setActivePodId`; localStorage persistence |
| `src/lib/podRecords.ts` | All pod Supabase queries |
| `src/lib/userCommanderRecords.ts` | `user_commanders` CRUD |
| `src/components/PlayerProfileDropdown.tsx` | Top-right nav popover |
| `src/components/profile/DeckRoster.tsx` | Deck list + Scryfall add |
| `src/components/profile/PodManager.tsx` | Pod list, create, join, admin controls |
| `src/components/PodSwitcher.tsx` | Compact pod switcher in nav |
| `src/pages/JoinPodPage.tsx` | `/join/:inviteCode` route |

### Modified Files
| File | Change |
|---|---|
| `src/App.tsx` | Add `<PodProvider>`, `/join/:inviteCode` route |
| `src/components/Layout.tsx` | Replace email/logout with dropdown; add PodSwitcher + pod name |
| `src/lib/gameRecords.ts` | Add podId param to fetch functions; update createGameWithParticipants |
| `src/pages/DashboardPage.tsx` | Filter by activePodId; "no pod" empty state |
| `src/pages/GameHistoryPage.tsx` | Filter by activePodId; hide edit controls for non-admins |
| `src/pages/AddGamePage.tsx` | Block non-admins; pass activePodId |
| `src/pages/PlayersPage.tsx` | Filter by activePodId |
| `src/pages/MyProfilePage.tsx` | M1: deprecation banner; M2: redirect to `/` |

---

## Milestones

### M1 — Database Foundation + PodContext
Schema + RPCs deployed, test-pod backfilled, PodContext available, existing UI unaffected.

Verify:
- `npx supabase db push` clean
- `get_user_pods()` returns test-pod
- `/join/<code>` joins + redirects
- No TypeScript errors, no page regressions

### M2 — Pod-Scoped UI + Profile Dropdown
All pages pod-filtered, profile dropdown live, admin gates enforced, pod creation/join UI working.

Verify:
- Pod switch updates all pages
- Non-admin blocked from Add Game + edit controls
- Game created successfully with pod_id
- Deck roster + Scryfall add working
- Invite link copyable; join flow works end-to-end

### M3 — Multi-User Validation + Admin Controls
Second user joins pod; admin controls (kick/promote/demote) wired + tested; premium toggle verified.

Verify:
- Two browsers see same shared game history
- Kick revokes access
- Last-admin demotion blocked
- `pod_creation_enabled = false` shows user-visible error
- Cross-pod commander suggestions working

---

## Design Notes

- `players` and `commanders` NOT restructured — avoids cascade rewrites across all RPCs
- Admin-only writes dual-enforced: RPC body check + RLS WITH CHECK
- `user_commanders` denormalized (no FK to `commanders`) — sidesteps cross-user commander RLS issues for deck roster
- `pod_id` denormalized onto `game_participants` — avoids double-join in every RLS check
- `pod_creation_enabled` in `app_config` is the premium hook — flip via service_role when billing is ready
