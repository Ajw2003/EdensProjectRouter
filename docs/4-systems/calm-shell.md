# Calm shell (built, not yet tested by Aj)

Issue #28 (Calm shell: session list and up to four sessions side by side), part of #35. Replaces the session grid ([session-grid.md](session-grid.md)).

## What it owns

The Windows app's main window: the session list on the left and one to four session panes side by side.

| Part | File | Job |
|---|---|---|
| Layout | `site/js/panes.js` | Pure: which sessions are open, in what order, each pane's Terminal or Visual mode, and the last mode picked. Saved and restored on restart. Tests: `tests/panes.test.js`. |
| Session list | `site/js/sessionlist.js` | Today, Earlier, Show N more, stars, a green dot for a running session and an orange dot for one waiting on you. |
| Shell | `site/js/shell.js` | Opens panes by click, Ctrl-click, Open beside or drag; refuses a fifth with "Four sessions are open. Close one first." |
| Pane | `site/js/pane.js` | The Terminal and Visual switch, the menu (Send to, Ask another session, Show tool, Visuals, Close) and ×. The Visual side is the Visual view (`site/js/visual.js`, step 3, #29). |
| Waiting dot | `desktop/main.js`, `desktop/preload.js`, `site/js/terminal.js` (`screenLines`) | Every 1.5 s, the drawn screen of each open terminal goes through `screenWaiting` in `desktop/keys.js`; a selector on screen means orange. |

## ADHD and autism layer (step 5, #31)

| Part | Code | What it does |
|---|---|---|
| What to show | `site/js/calm.js` (`PRESETS`, `KINDS`, `setPreset`, `setSwitch`, `presetOf`), `site/js/calmpage.js` | Three presets (Calm, Balanced, Everything; Calm shows why lines, tasks, pictures, artifact cards, where you were and notifications, and keeps action cards and raw results off), one switch per kind of information, and Reduce motion. Opened from More, then "What to show…". It is saved in localStorage, and turning one switch makes the preset "custom". |
| Needs you | `needsYouList`, `openQuestionOf` in `site/js/calm.js`; `rebuildNeeds`, `scanClosed` in `site/js/shell.js` | Sits at the top of the session list, newest first. Open panes are read from the drawn screen. A closed session is read from the last unanswered question in its transcript, and only if it was active in the last 2 hours. |
| Notifications | `notify` IPC in `desktop/main.js` and `desktop/preload.js` | One notification each time a session joins Needs you. Clicking it opens that session's focus card. |
| Focus card | `site/js/visual.js` | A waiting question fills the Visual view, with a Put aside button. |
| Now strip | `taskSteps` in `site/js/calm.js` | Claude's task list as steps: done in green, the current step outlined. |
| Where you were | `site/js/calm.js`, `site/js/visual.js` | After 30 minutes away (`IDLE_MS`), a card shows the goal and the last thing Claude said, with a Dismiss button. |
| Details | `site/js/visualside.js` | The account, model, folder, files changed and limit bars, opened from the pane menu. |

## Traps

- Notification baseline: the first list update can arrive before any sessions are listed. The baseline is therefore taken at the first scan that sees sessions. If it were taken at the very first scan, everything that was already waiting at start would send a notification (found by the drive on 2026-11-19).
- Menus at the bottom of the window: long menus, such as More, are capped to the window height and scroll (`.grid-menu` in `site/grid.css`). They also open upward from a button near the bottom (`site/js/menu.js`).

## Invariants

- Switching a pane between Terminal and Visual never stops Claude Code.
- Orange means Claude needs you and green means running; nothing else in the shell uses those colours.

## What was removed

Quick layouts, saved layouts, Set size, the projects tile, project folding, New window and Move to window, as issue #28 says. The limits strip is hidden; each session still shows its own limit bars. The Visuals tile is reachable from the pane menu until step 4 (#30) replaces it. The multi-window code in `desktop/main.js` (`windowList`, `moveTile`, saved windows in `desktop/layoutstore.js`) is now unused and still present.

## Checked

Driven on 2026-11-18 in the packaged Linux app with a stand-in Claude Code: the list, one to four panes, the switch, closing, the green and orange dots and a live terminal in a pane. Screenshots: `docs/generated/shell-*.png`. A restart reopened the same panes and modes. Not checked: native drag (a synthetic drop was used) and Windows.

## Pages and pictures in the Visual chat

`visualNode` in `site/js/visual.js` shows a picture inline, an HTML page as a card with a sandboxed iframe (`sandbox="allow-scripts"`, no referrer, lazy, 280 px, Expand makes it 70% of the window) and a Markdown file rendered by `site/js/markdownview.js` in a fully sandboxed iframe. No Content-Security-Policy or frame header blocks `router-file://` framing, so nothing was loosened. `site/js/visualinline.js` picks the note: a file not under a readable folder says it is on the cloud session; over the phone link a note says pages and pictures are not shown yet (known gap). A page that loads but is refused (403) still shows the refusal text inside the frame, because an iframe fires no error event for that.
