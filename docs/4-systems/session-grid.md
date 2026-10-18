# Session grid

**Status: built, in QA.** Approved on 2026-10-18 ("Design approved: router session grid 1A 2A 3A 4A 5A"). Build contract: `docs/plans/router-grid-spec.md`, sections 1 to 4. Windows app only; the website keeps the session view (`session-view.md`).

## What it owns

- The app window's grid of tiles: the Projects tile, single-project tiles and session tiles, built on dockview-core.
- One grid window per monitor, and moving tiles between them.
- Quick layouts (including Projects only), exact percentage sizes, saved layouts, and putting every window back on start without running anything.
- The account shown on each tile, adding an account, and moving a session to another account.
- How many sessions each project shows, and pinning.

## How it works

- A session tile shows the last 3 messages and a Resume button until resumed, then its terminal. Claude Code runs in main (`desktop/pty.js`), not in the tile, so moving or closing a tile never stops it; main keeps the last 256 KB of output to redraw a moved terminal.
- Layout and window positions are saved to `%APPDATA%\Project Router\layout.json` on quit.
- Moving a session to another account copies its transcript into that account's folder and resumes it there; the original stays.

## Built

Steps 1 to 3 of issue #15 (grid, quick and saved layouts, restore) are built and were driven in the Linux build with the fake `claude`. Differences from the spec:

- dockview-core 8.4.1 has no separate CSS file; its browser build adds its own style element. `copy-vendor.cjs` therefore copies one file, `site/vendor/dockview/dockview-core.js`.
- Code lives in `site/js/grid.js` (layout file, quick layouts, sizes, dialogs, dockview setup), `site/js/tiles/projects.js` and `site/js/tiles/session.js`; styles in `site/grid.css`. The main process side is `desktop/layoutstore.js` (atomic write: temp file, then rename) and the `layoutGet`/`layoutSet` IPC pair. The page also saves 0.5 s after each layout change, so a crash keeps the last layout; on quit main asks the page for its layout and writes it.
- 3+1 is one large tile on the left and three stacked on the right. Slots without a tile stay as empty tiles (with a short hint) and the next session you open fills the first empty one.
- A new-session tile that was running when you quit comes back as "Start Claude Code" (it has no session id to resume yet) and does not start until pressed.
- A project row in the list has a small "Tile" button that opens a `project` tile. Dragging a row onto the grid is not built yet.
- A stopped terminal shows "Resume again" in the tile header. Closing a tile never stops its Claude Code.
- Not in this step: the account pill, "Move to window", the 256 KB output replay, Visuals tiles, "Show all N" (later steps of the spec).
- If the grid cannot start (for example the vendor file is missing) the app says so and shows the plain list and session view without the in-app terminal.

## Traps

- Dragging between two Electron windows is unverified on Windows; "Move to window" in the tile menu does the same job.
- Each account needs its own folder (`.claude-<name>`) and one sign-in. Aj's PC showed one folder so far.
