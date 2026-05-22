# Add Google Sign-In

## Summary

Add Google OAuth as an additional Supabase Auth method for the Vite SPA. Google sign-in will live alongside the existing email/password sign-in, signup, forgot-password, and reset-password flows. The app keeps its direct browser Supabase model, persistent sessions, protected routes, and RLS-backed data isolation.

This changes the product model from one owner account only to any authenticated user with isolated tracker data. Existing migrated owner data remains tied to the original owner UUID. New Google users start with empty app data unless Supabase automatically links the Google identity to an existing same-email account.

## Key Changes

- Add one `Continue with Google` action to the `/login` page for sign-in and sign-up modes.
- Use Supabase OAuth from the browser:

  ```ts
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  ```

- Keep email/password sign-in, email/password signup, forgot-password email, and reset-password update unchanged.
- Do not add Google One Tap, a backend callback route, manual identity-linking UI, or provider-token storage in v0.3.
- Keep all app authorization based on Supabase sessions and existing `auth.uid() = user_id` RLS policies.

## Security And Account Model

- Any Google account may authenticate.
- A new Google user should get a `profiles` row from the existing `auth.users` trigger and should initially see no games, players, commanders, dashboard stats, history, or pod stats.
- If Google uses the same verified email as an existing Supabase user, rely on Supabase automatic identity linking.
- Do not request extra Google scopes beyond Supabase's required profile scopes:
  - `openid`
  - Google user email
  - Google user profile
- Do not read, persist, or expose Google `provider_token` or `provider_refresh_token`.
- Do not make RLS decisions from `user_metadata`; continue using `auth.uid()` and table `user_id`.
- Anonymous users must remain unable to read app tables/views or call game RPCs.

## Dashboard And Provider Setup

Configure Google Cloud:

- OAuth client type: `Web application`
- Authorized JavaScript origins:
  - `http://127.0.0.1:5173`
  - `http://localhost:5173`
  - production domain when available
- Authorized redirect URI:
  - the Supabase project Google provider callback URL from the Supabase Dashboard

Configure Supabase Dashboard:

- Enable the Google Auth provider.
- Add the Google Client ID and Client Secret.
- Keep email/password enabled.
- Add redirect allow-list entries:
  - `http://127.0.0.1:5173/**`
  - `http://localhost:5173/**`
  - future Vercel production URL
  - Vercel preview wildcard if preview auth testing is needed

## Test Plan

- Google sign-in from `/login` redirects to Google and returns to the app authenticated.
- Existing email/password sign-in still works.
- Existing email/password signup still works.
- Forgot-password and reset-password still work.
- Logout works after Google sign-in.
- Existing owner still sees migrated games, players, commanders, dashboard stats, history, and pod stats.
- A new Google user sees empty own-scoped tracker data.
- A new Google user can add a game, and created rows use that user's `auth.uid()`.
- Anonymous users still cannot read app data or call game RPCs.
- Authenticated users cannot read or mutate another user's rows.
- Run `npm test -- --run`.
- Run `npm run build`.
- Run Supabase security advisors after provider configuration.

## Assumptions

- The app remains a Vite SPA with no custom backend callback route.
- Google sign-in uses Supabase OAuth redirect flow, not Google One Tap.
- Any Google user is allowed to create an isolated account.
- Email/password sign-in and signup remain enabled.
- Manual identity-linking UI is out of scope for v0.3.
- Production URL is not final yet, so localhost and Vercel guidance are documented without hardcoding a final domain.

## References

- Supabase Google OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
