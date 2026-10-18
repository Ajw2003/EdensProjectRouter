# Router session grid, visuals and hand-off: build spec

The build contract for two designs Aj approved on 2026-10-18:

- `docs/plans/router-session-grid.html`: "Design approved: router session grid 1A 2A 3A 4A 5A".
- `docs/plans/router-visuals-handoff.html`: "Design approved: router visuals and handoff 1A 2A 3C 4* 5*", with Aj's own answers for choices 4 and 5 (see `docs/6-decisions/Decisions.md`).

It extends `docs/plans/router-redesign-spec.md`. Where the two disagree, this file wins. System docs: `docs/4-systems/session-grid.md` and `docs/4-systems/visuals-handoff.md`. Everything here is the Windows app only; the website keeps today's read-only list and session view.

## What changes, what stays (parity inventory)

| Today (file) | Keep / change / drop |
|---|---|
| Fixed left list + one right pane (`site/index.html`, `site/js/main.js`) | **Change**: the app window becomes a dockview grid. The list (`site/js/list.js` `renderList`) renders inside a "Projects" tile. The website keeps the fixed layout. |
| Open session pane (`site/js/sessionview.js` `openSession`) | **Change**: becomes a session tile. Header keeps title, three bars and adds the account pill. Body shows the last 3 messages and when the session was last active, plus one Resume button, until resumed; then the terminal fills the tile. **Drop**: the full readable conversation, "Copy resume line", and the big "Open in Windows Terminal" button (it becomes a small icon in the tile header). `transcript.js` stays for the preview, the cleaned copy and visuals discovery. |
| `openSession` keeps one view at a time (`current`) | **Change**: one view per tile; many at once. |
| Terminal panels (`site/js/terminal.js` `createPanels`, `desktop/pty.js`) | **Keep**, plus: main keeps the last 256 KB of each pty's output so a tile moved to another window can redraw its terminal. |
| Limits strip (`site/js/strip.js`) | **Keep**, and the strip's account name becomes a menu that sets which account new sessions start on. |
| `limits.accountForNewSession` | **Keep** as the default when no account is picked. |
| Quit prompt (`desktop/main.js`) | **Keep**. |
| Account discovery (`desktop/accounts.js`, `.claude` and `.claude-*` folders) | **Keep**, plus "Add account" (below). |
| List rows, search, folding, "Older" heading | **Change**: "Older" is replaced by the per-project count and "Show all N" (choice 4A). Search still covers every session. |

## Layout

```
site/js/
  grid.js          dockview-core setup, tile kinds, quick layouts, exact-size dialog, save/restore of layouts
  tiles/projects.js  the Projects tile (wraps list.js) and the single-project tile
  tiles/session.js   session tile: header, preview + Resume, terminal, account pill
  tiles/visuals.js   the Visuals tile and its viewer
  sessionlimit.js  pure: which sessions a project shows (pins, then newest, up to N)
  handoff.js       pure: cleaned-copy Markdown from transcript entries, file names, @mention text
  visualsfind.js   pure: viewable files from transcript entries
site/vendor/dockview/  copied from dockview-core by desktop/scripts/copy-vendor.cjs (not committed)
site/vendor/marked/    copied from marked by the same script
desktop/
  windows.js       one BrowserWindow per grid window, monitor and bounds saved
  handoff.js       writes .router-handoff files, the git exclude toggle, the summary and Ask runs
  accountsetup.js  creates a new account folder and runs the sign-in
  showtool/server.cjs  the Show tool: a small MCP server over stdio
  pagepreload.cjs  preload for page webviews: reports copied replies to the tile
```

New dependencies, all MIT: `dockview-core` 8.4.1 (spiked here: a 2x2 grid rendered in Chromium with no errors), `marked` for Markdown, `@modelcontextprotocol/sdk` for the Show tool. Versions pinned in `desktop/package.json`.

## 1. Grid (grid 1A, 2A, 5A)

- Tile kinds: `projects` (all projects), `project` (one project's sessions), `session`, `visuals` (one project). Each tile's header has the project colour stripe.
- Clicking a session in a projects tile focuses its tile if open, else adds a session tile to the right of the active one. Dragging a session or project from a list onto the grid adds a tile where it is dropped.
- Quick layouts: 1, 2 side by side, 2x2, 3+1, and **Projects only** (every open tile in this window becomes a tab of one group, and a `projects` tile fills the window). Saved layouts: name + dockview `toJSON()`, kept in the app's settings file.
- Exact sizes: a tile menu item "Set size…" takes a width and/or height as a percentage of the window and calls dockview's `setSize` on the group.
- Restore (5A): on quit, every window's dockview JSON and bounds are saved to `%APPDATA%\Project Router\layout.json`. On start they are restored; session tiles come back showing preview + Resume, and no Claude Code starts until Resume.

## 2. Windows per monitor (grid 1A)

- "New window" in the top bar opens another BrowserWindow with the same page and an empty grid. Each window saves its display id, bounds and grid.
- Moving a tile between windows: drag its header out of one window and drop it on another. The renderer puts `application/x-router-tile` (JSON: tile kind and ids) on the drag data; the target window's drop handler adds the tile and asks main to close it in the source window. A "Move to window ▸" item in the tile menu does the same without dragging. Cross-window HTML drag between Electron windows is **unverified**; the menu item is the fallback if it fails on Windows.
- A session's pty stays in main, so moving a tile never restarts Claude Code. The new xterm replays the kept output, then attaches.

## 3. Accounts (grid 3A)

- Each tile header shows its account as an email pill (from `oauthAccount.emailAddress` in that folder's `.claude.json`; the folder name if missing).
- "Add account" (top-bar account menu) asks for a short name, creates `%USERPROFILE%\.claude-<name>`, and opens a tile running `claude auth login` with `CLAUDE_CONFIG_DIR` set to it. When sign-in finishes, discovery picks the folder up.
- Switching a tile's account: the pill's menu lists the other accounts with their 5-hour and weekly use. Picking one copies the session's transcript into that account's `projects/<same dir>/` (never moves or deletes the original), records the switch, and resumes there. A running session is asked first ("Stop Claude Code in this tile and continue on <email>?").

## 4. Fewer sessions (grid 4A)

- Per project: `count` (default 2) and `pins` (session ids), kept in the app settings. `sessionlimit.js` returns pinned sessions (newest first), then the newest unpinned sessions until `count` is reached, and `hiddenCount`.
- The project row has a small number control (1 to 20) and a "Show all N" link when `hiddenCount > 0`; a pin icon on each row toggles pinning. Search ignores the limit.

## 5. Visuals tile (visuals 1A)

- `visualsfind.js` reads transcript `tool_use` entries for `Write`, `Edit`, `MultiEdit` and `NotebookEdit` and keeps paths ending in `.png .jpg .jpeg .gif .webp .svg .mp4 .webm .pdf .md .html .htm`. It also takes absolute `https://claude.ai/…artifact…` links from Claude's text. Newest first, one entry per path, with the session it came from.
- The Show tool: `desktop/showtool/server.cjs` offers one tool, `show(path, caption?)`, and appends `{path, caption, cwd, at}` to `%APPDATA%\Project Router\shows.jsonl`; the app watches that file and adds the entry to the matching project's Visuals tile. Setup is one click per account in the top-bar account menu ("Turn on Show tool"), which runs `claude mcp add --scope user router-show -- "<app exe>" "<server.cjs>"` with `ELECTRON_RUN_AS_NODE=1` and that account's `CLAUDE_CONFIG_DIR`. Turning it off runs `claude mcp remove`.
- Viewer: pictures and video through a `router-file://` protocol that serves only files under a known project folder; PDF in Chromium's own viewer; Markdown rendered by `marked` with HTML disabled; HTML pages in a `<webview>` with `partition="router-pages"`, no Node, `contextIsolation`, and `desktop/pagepreload.cjs`. claude.ai links open in a `<webview>` with `partition="persist:claude-<account id>"` so each account signs in once.
- A project row in the list gets a dot when its Visuals tile has entries newer than the last time that tile was looked at.

## 6. Send a page's reply (visuals 2A)

- `pagepreload.cjs` wraps `navigator.clipboard.writeText` (and listens for `copy` events) inside a page. When a page copies text, the preload sends it to the tile, which shows "Send to <session title>" beside the page. The page's own copy still happens.
- Send types the text into that session's pty without a trailing Enter, so Aj reviews it and presses Enter. If the session isn't running, Send resumes it in its tile first and types once its output has been quiet for 1.5 seconds.
- A page's session is the one whose transcript wrote it; a page found from more than one session uses the newest.

## 7. Send to (visuals 3C, 5*)

- Every visual, every session row and every session tile has "Send to…". Targets: an open session tile, a new session in any project, or a sub-session of the source.
- A file inside the target project is sent as `@<relative path> ` typed into the prompt (no Enter). A file outside it is first copied to `<target project>\.router-handoff\`.
- A conversation is sent as one of (chosen in the Send dialog, cleaned copy preselected):
  - **Cleaned copy** (free): `handoff.js` writes your messages, Claude's replies and one line per tool as Markdown to `.router-handoff\<yyyy-mm-dd>-<title-slug>.md`.
  - **Summary** (uses usage): `claude -p --resume <id> --fork-session --no-session-persistence --tools Read,Grep,Glob "<brief prompt>"` run in the source project with the source account's folder; the output is saved the same way. The dialog shows the source account's 5-hour and weekly use before Aj confirms.
- Sub-session: a new tile running `claude --resume <id> --fork-session`. The router records `{child, parent}` in its settings and lists the child under its parent.
- `.router-handoff` is **not** excluded from git by default (Aj's answer 5). The project tile menu has "Keep hand-off files out of git", which adds or removes the line `.router-handoff/` in `<repo>\.git\info\exclude` (a local file git never commits). The setting shows its current state as a tick.

## 8. Ask another session (visuals 4*)

- From a session tile: "Ask another session…" opens a dialog with a session picker and a question box. Two buttons:
  - **Send the conversation with my question** (always available, free): writes the other session's cleaned copy and types `@<that file> <question>` into the asking session without Enter.
  - **Ask a read-only copy** (uses usage): runs `claude -p --resume <id> --fork-session --no-session-persistence --tools Read,Grep,Glob "<question>"` in the other session's project with its account folder, writes the answer to `.router-handoff\<date>-answer-<slug>.md` and types `@<that file> ` into the asking session. The button shows the account's 5-hour and weekly use, and is disabled with the reason when that account has no room (5-hour at 100%, or limits unknown and Aj hasn't allowed asking without them).
- Neither path writes to the other session's transcript or project.

## Tests

- Unit (Node, `tests/`): `sessionlimit`, `handoff` (cleaned copy, slugs, @mention text, exclude-file edits), `visualsfind`, the Show tool's line format, the Ask/summary command builders, layout save/restore round trip.
- Windows CI: the existing steps plus a run of `showtool/server.cjs` under Electron's Node answering one `show` call.
- Driven here: the packaged Linux build, with the fake `claude` and fake home used for the redesign, through Playwright: a 2x2 layout, Projects only, a tile moved by "Move to window", a page's copied reply sent to a session, Send to with a cleaned copy, Ask's free path, and the git exclude toggle on a fake repository. Real Claude Code's `--fork-session` and `-p` runs, cross-window drag, and the Show tool inside real Claude Code can only be checked on Aj's PC.
