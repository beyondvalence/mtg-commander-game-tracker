# Impeccable Audit — MTG Commander Tracker

**Date:** 2026-06-04
**Command:** `/impeccable audit each page for a clean modern tech electric-green look that is in sync`
**Score:** 13/20 — Acceptable (significant work needed)

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2/4 | No reduced-motion, undefined `btn-secondary`, plain text loading states with no `role="status"` |
| 2 | Performance | 3/4 | Inter + Space Grotesk referenced but never loaded — intended typography never renders |
| 3 | Theming | 2/4 | Two undefined CSS tokens (`--app-accent`, `--color-error`); input focus rings blue, buttons green |
| 4 | Responsive Design | 3/4 | Mostly solid; sub-44px touch targets in PodManager member actions |
| 5 | Anti-Patterns | 3/4 | Strong electric-green identity; body gradient mixes blue with no blue elsewhere in UI |
| **Total** | | **13/20** | **Acceptable** |

---

## Anti-Patterns Verdict

Mostly not AI-generated. Distinctive electric-green dark identity. Three specific tells:

1. **Body background gradient contains `rgba(59, 130, 246, 0.16)` (blue)** — no blue anywhere else in the active UI. Gradient promises blue; UI never delivers it.
2. **Loading states use `wireframe-copy`** — large centered text that reads like dev scaffolding left in place.
3. **Eyebrow label saturation** — `text-xs font-semibold uppercase tracking-[0.2em]` on stat cards, seat headers, game numbers, notes labels, commander stage indicators. Each defensible alone; together they create monotonous texture.

---

## Detailed Findings

### P0 — Blocking

**`var(--app-accent)` undefined — player filter "Apply" button is invisible**
- Location: `GameHistoryPage.tsx:427` — `style={{ background: 'var(--app-accent)', color: 'var(--app-accent-text)' }}`
- Impact: "Apply" button renders transparent in both themes. Users cannot confirm multi-player filter selections.
- Fix: Define `--app-accent: #22c55e` and `--app-accent-text: #052e16` in `:root`; appropriate green in dark theme.
- Command: `/impeccable polish`

**`btn-secondary` class undefined — JoinPodPage "Go home" button unstyled**
- Location: `JoinPodPage.tsx:37`
- Impact: On failed join (invalid invite code), the only escape renders as an unstyled element.
- Fix: Replace `btn-secondary` with `logout-button` or equivalent existing class.
- Command: `/impeccable polish`

---

### P1 — Major

**Inter and Space Grotesk fonts never loaded**
- Location: `index.html` — no Google Fonts link or `@font-face`
- Impact: Typography falls back to Segoe UI / system-ui. Space Grotesk wordmark and nav labels never render. Design intent unrealized on every device.
- Fix: Add Google Fonts preconnect + stylesheet to `index.html`. Minimum: Inter (400/600/700/800) + Space Grotesk (700/800).
- Command: `/impeccable typeset`

**Input focus rings blue; button focus rings green — split focus identity**
- Location: `index.css:300-318` — `.app-input:focus` and `.app-input-compact:focus` use `#3b82f6`; all other focus states use `#22c55e`
- WCAG: 2.4.11 Focus Appearance (AA)
- Impact: Electric-green focus identity breaks at every text input and select. Blue also used in body gradient — one color, two conflicting roles.
- Fix: Change `.app-input:focus` and `.app-input-compact:focus` to `border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2)`.
- Command: `/impeccable polish`

**No `@media (prefers-reduced-motion)` anywhere**
- Location: `index.css` — 33+ `transition`/`transform` declarations, zero reduced-motion counterparts
- WCAG: 2.3.3 Animation from Interactions
- Impact: Users who enabled system Reduce Motion still experience all hover transforms, card lifts, theme transitions.
- Fix:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
  ```
- Command: `/impeccable animate`

**`var(--color-error, red)` uses raw `red` fallback**
- Location: `JoinPodPage.tsx:36`
- Impact: `--color-error` is undefined; falls back to literal CSS `red` (#ff0000). Fails contrast on both themes; off-brand.
- Fix: Use `wireframe-copy text-red-600` pattern matching the rest of the app.
- Command: `/impeccable polish`

---

### P2 — Minor

**Semantic color vocabulary fragmented — hex vs Tailwind utilities vs tokens**
- Locations:
  - `GameHistoryPage.tsx:626-627, 697-712` — inline `#047857` / `#dc2626`
  - `GameHistoryPage.tsx:721` — `border-emerald-700 text-emerald-700`
  - `AddGamePage.tsx:528-541` — inline `#047857` / `#dc2626`
  - `MyProfilePage.tsx:141` — `text-amber-600`
  - `PodManager.tsx:103,180,207` — `text-red-600`, `text-amber-600`, `text-red-500`
  - Multiple pages — `text-red-600` for errors
- WCAG: 1.4.3 Contrast (AA) — `text-amber-600` on dark bg has ~3.4:1, below 4.5:1 minimum
- Fix: Define `--app-error`, `--app-warning`, `--app-success` tokens in both themes. Replace all hardcoded semantic colors.
- Command: `/impeccable colorize`

**Loading states are oversized plain text — no skeleton states, no `role="status"`**
- Location: All pages — `<p className='wireframe-copy'>Loading...</p>` pattern
- WCAG: 4.1.3 Status Messages (AA)
- Impact: `wireframe-copy` is `text-xl md:text-3xl` — loading text nearly as large as page headings. No live region announcement for screen readers.
- Fix: Replace with smaller status text + `role="status"` wrapper. Use skeleton cards for dashboard/history.
- Command: `/impeccable harden`

**Sub-44px touch targets in PodManager member action buttons**
- Location: `PodManager.tsx:186-211` — "Promote", "Demote", "Kick" buttons with no padding
- WCAG: 2.5.8 Target Size (AA minimum 24x24px)
- Fix: Add `px-2 py-1 min-h-[2rem]` to each member action button.
- Command: `/impeccable adapt`

---

### P3 — Polish

**Body background gradient includes blue with no blue in the UI**
- Location: `index.css:37` — `radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), ...)`
- Impact: Canvas and interface feel like slightly different color stories. Visible on light mode especially.
- Fix: Replace blue radial with a second muted/darker green radial to unify canvas with UI identity.
- Command: `/impeccable colorize`

**`wireframe-copy` used for inline guidance text at wrong scale**
- Location: Dashboard, History, Players, Profile — empty states and inline messages
- Impact: `text-xl md:text-3xl` creates awkward emphasis on short messages like "No games saved yet."
- Fix: Use `app-muted text-sm` / `text-base` for inline guidance. Reserve `wireframe-copy` for genuine placeholder stages only.
- Command: `/impeccable clarify`

---

## Systemic Issues

1. **Three parallel semantic color systems** (CSS tokens + Tailwind utilities + raw hex) affect 12+ files. One `--app-error`/`--app-warning`/`--app-success` token set eliminates dark-mode contrast fragility in one pass.

2. **Focus ring color identity split at system boundary** — everything uses green, inputs use blue. One CSS rule change, surfaces everywhere.

3. **Loading states never upgraded from scaffolding** — `wireframe-copy` used in all five content pages. Same pattern throughout.

---

## Positive Findings

- Token system architecture (`--app-panel`, `--app-panel-soft`, `--app-panel-strong`, `--app-hover`, `--app-shell`) covers full surface hierarchy cleanly across both themes.
- Focus ring system for interactive components is strong — buttons, nav links, card hover states all use green glow ring consistently.
- Green accent discipline is correct — reserved for winners, active states, primary actions only. Never decorative on inactive elements.
- Commander card images use `loading='lazy'` throughout.
- ARIA usage is solid where present — `aria-expanded`, `aria-controls`, `aria-label`, `aria-hidden` correctly applied.
- `dashboard-add-game-card` dark green gradient CTA is sharp, distinct, and on-brand — one of the strongest individual design decisions.

---

## Recommended Actions (priority order)

1. **[P0] `/impeccable polish`** — Define `--app-accent`/`--app-accent-text` tokens, fix `btn-secondary` on JoinPodPage, fix `--color-error` fallback
2. **[P1] `/impeccable typeset`** — Load Inter and Space Grotesk fonts
3. **[P1] `/impeccable polish`** — Unify input focus ring to green (#22c55e)
4. **[P1] `/impeccable animate`** — Add `@media (prefers-reduced-motion)` block
5. **[P2] `/impeccable colorize`** — Define semantic tokens (`--app-error`, `--app-warning`, `--app-success`); replace scattered hardcoded colors; replace blue body gradient with green
6. **[P2] `/impeccable harden`** — Upgrade loading states: reduce `wireframe-copy` sizing, add `role="status"`, add skeleton cards
7. **[P2] `/impeccable adapt`** — Fix sub-44px touch targets on PodManager member actions
8. **[P3] `/impeccable clarify`** — Replace `wireframe-copy` in empty/loading inline messages with appropriate text scale
9. **[P0→done] `/impeccable polish`** — Final sweep before shipping
