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
- Not in this step: the account pill, Visuals tiles, "Show all N" (later steps of the spec).
- If the grid cannot start (for example the vendor file is missing) the app says so and shows the plain list and session view without the in-app terminal.

### Built: fewer sessions (issue #18)

- `site/js/sessionlimit.js` (pure) returns pinned sessions newest first, then the newest unpinned up to `count` (default 2, clamped 1 to 20), plus `hiddenCount`. Pins always show, even beyond count.
- `site/js/list.js` replaces the "Older" heading: each project row has a minus / value / plus control and, when sessions are hidden, "Show all N" (then "Show fewer"). Each session row has a pin toggle (`aria-pressed`). Search ignores the limit.
- State is `limits[project] = { count, pins, all }` inside localStorage `router.list`, next to `folded` and `query`; the old shape still loads. It is kept in the page's storage, not in the app settings file as the spec says. The website, the Projects tile and single-project tiles all go through `renderList`, so they share it.
- Driven in a browser on a fake model (12 sessions in one project) with a screenshot at `docs/generated/fewer-sessions.png`; not driven inside the Electron app.

### Built: accounts (issue #17)

- Each session tile header has an account pill (email, else folder name) that opens a menu of the other accounts with their 5-hour and weekly use. Picking one: if running, a dialog asks "Stop Claude Code in this tile and continue on <email>?" (Stop and continue / Cancel) and the pty is stopped; `copySessionTo` copies the transcript and sibling folder (never overwriting a newer file, never deleting); the tile records the account with `api.updateParameters` and resumes on the new account. A running new session (no id yet) cannot be moved: the tile says to stop it first.
- The limits strip's account name is a menu button that sets which account New session uses (kept in localStorage `router.newSessionAccount`; default stays the account with most room). It also holds "Add account…": a short name (letters, digits, dash), the folder `<home>/.claude-<name>`, and a tile titled "Sign in: <name>" running `claude auth login`. When that process ends the panels refresh, which re-scans the folders.
- Shared menu and dialogs are in `site/js/menu.js` (arrow keys, Home/End, Escape, visible focus); pure helpers in `site/js/accounts.js`.
- Differences and limits: `grid.js` and `terminal.js` were not edited (another builder's files), so the login tile is recognised by an in-page registry (`pendingLogins`) and main marks the folder for the next `ptyOpen`; after an app restart a login tile comes back as a plain new session in that account. After a switch the session also shows in the list under the old account (the original stays), and a layout saved before the switch reopens the tile on the new account.
- Driven in the Linux build with the fake `claude` and two fake accounts; screenshot `docs/generated/grid-accounts.png`.

## Traps

- Dragging between two Electron windows is unverified on Windows; "Move to window" in the tile menu does the same job.
- Each account needs its own folder (`.claude-<name>`) and one sign-in. Aj's PC showed one folder so far.

## Built: windows (issue #16)

- "New window" (layout row) opens another grid window. `desktop/main.js` keeps one entry per window (id, display id, bounds, dockview JSON); `layout.json` is now `{ version: 2, saved, windows: [...] }`. The old `{ version: 1, current, saved }` file reads as window 1 (`normalizeLayoutFile` in `desktop/layoutstore.js`). Saved layouts are shared by all windows; the last window to save wins.
- On start every saved window reopens on its display; a gone display falls back to the primary one, centred (`placeWindow`). Closing a window that is not the last just closes it and forgets it; closing the last one, or quitting, asks about running sessions as before and saves every open window.
- `desktop/pty.js` keeps the last 256 KB (characters) of each pty; IPC `ptyBuffer` returns `{ data, end }`. Main sends a pty data and exit events only to the window that shows it; moving a tile hands the pty to the new window. The new terminal writes the buffer, then live data, dropping chunks the buffer already holds (`liveAfterSnapshot` in `site/js/terminal.js`).
- Tile menu "Move to window ▸" lists the other windows and "New window"; main relays `{ id, title, params, ptyId }`. A running session keeps its process. The ptyId is never saved in the layout.
- Header drag between windows (`application/x-router-tile`) is not built: Playwright cannot drive a native drag between two Electron windows, so it could not be shown to work. The menu does the job.
- A new window opens on a monitor that has no grid window yet; with none free it opens 40 px down and right of the focused window, 40 px smaller.
