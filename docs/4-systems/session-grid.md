# Session grid

**Status: planned.** Approved on 2026-10-18 ("Design approved: router session grid 1A 2A 3A 4A 5A"). Build contract: `docs/plans/router-grid-spec.md`, sections 1 to 4. Windows app only; the website keeps the session view (`session-view.md`).

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

## Traps

- Dragging between two Electron windows is unverified on Windows; "Move to window" in the tile menu does the same job.
- Each account needs its own folder (`.claude-<name>`) and one sign-in. Aj's PC showed one folder so far.
