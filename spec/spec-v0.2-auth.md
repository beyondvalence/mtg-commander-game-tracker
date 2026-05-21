# Add Owner-Only Supabase Auth

## Summary

Add secure login for the Commander tracker using Supabase Auth email/password, one manually-created owner account, persistent browser sessions, password reset, and RLS-backed authorization. Existing no-login data will be migrated to that owner, then anonymous database access will be removed.

Chosen defaults:

- Email/password auth
- Single owner account
- Manual account creation in Supabase Dashboard
- Password reset included
- Persistent Supabase session
- MFA deferred
- Direct browser Supabase access protected by RLS

## Key Changes

- Add a real `/login` page with sign-in and forgot-password/reset handling.
- Add an auth/session provider around the app using `supabase.auth.getSession()` and `onAuthStateChange`.
- Add protected routing so unauthenticated users are redirected to `/login`.
- Add logout to the authenticated layout.
- Keep current public env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Database And Security

- Manually create/invite the owner in Supabase Auth, then disable public signup in the Supabase Dashboard.
- Configure Supabase Auth:
  - Minimum password length: 15+
  - Production Site URL and allowed redirect URLs
  - Password recovery redirect back to the app
- Add ownership to data:
  - Create `profiles` with `id references auth.users(id)`.
  - Add `user_id references auth.users(id)` to `players`, `commanders`, `games`, and `game_participants`.
  - Backfill all existing rows to the owner user ID.
  - Make `user_id` required after backfill.
- Replace permissive RLS policies with authenticated owner policies:
  - `to authenticated`
  - `using ((select auth.uid()) = user_id)`
  - `with check ((select auth.uid()) = user_id)`
- Revoke app table/view/function access from `anon`; grant only the minimum needed to `authenticated`.
- Update `create_game_with_participants` and `set_game_winner` so they require `auth.uid()`, write `user_id`, and only operate on that user's rows.
- Preserve existing `security_invoker = true` views so summary/history views respect base-table RLS.

## Test Plan

- Verify anonymous users cannot read, insert, update, delete, or call game RPCs.
- Verify the owner can sign in, reset password, stay signed in across refreshes, and sign out.
- Verify owner can view existing migrated games, players, commanders, dashboard stats, and history.
- Verify Add Game still creates game, participants, players, commanders, and winner state transactionally under the owner `user_id`.
- Verify History edits and winner changes cannot affect rows owned by another test user.
- Run `npm test`, `npm run build`, and Supabase security advisors after migration.

## Assumptions

- The app remains a Vite SPA deployed over HTTPS, likely Vercel.
- The owner user UUID will be supplied from Supabase Dashboard at migration time.
- No public signup UI in v1; account creation is dashboard-managed.
- MFA is intentionally deferred, but the auth design should not block adding TOTP later.

References: Supabase Auth, RLS, Securing your API, User Management, and OWASP Authentication Cheat Sheet.
