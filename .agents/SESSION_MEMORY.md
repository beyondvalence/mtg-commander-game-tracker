## Session Memory

- The app shell now uses a compact branded top navigation bar with a `PodTracker` logo, a highlighted `Add Game` nav action, and a theme button on the right.
- Dashboard has been refocused into `Pod Highlights` with clickable stat cards, a deep-linked latest-game tile, clickable recent-game rows, and a header-level `Add Game` action.
- Add Game now uses a single top control row for bracket, date, seats, and finished state.
- Add Game seat cards now emphasize commander art with a centered single-card stage and arrow-based horizontal switching when two commander cards are present.
- Add Game and History now share a labeled `Game Notes` panel style, plus a 500-character limit and live character count for editable notes.
- Game History now supports one edit flow per game for bracket, win condition, notes, and winner updates.
- History tile headers were tightened so metadata sits inline, winner status sits top-right, and edit/save actions stack on the right.
- History winner selection remains inside each seat card during edit mode.
- Game History filters now cover player, bracket, and win condition, all backed by URL params.
- History player names now link into Players with a prefilled player filter, and Players reads that `player` param into its own search bar.
- Players now includes expanded summary cards, a clearer filter bar with inline reset, player-to-history navigation, and clickable commander chips/art.
- Schema/code validation confirmed that shared game fields stay aligned across pages, including `games.notes`, `games.bracket`, `games.win_condition`, and winner linkage fields.
- The live Supabase `set_game_winner` function was previously fixed so it clears the old winner before assigning a new one, avoiding the unique partial-index violation on `game_participants.is_winner`.
- Current validation baseline: `npm run build` passes.
