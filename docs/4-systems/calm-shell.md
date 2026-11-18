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

## Invariants

- Switching a pane between Terminal and Visual never stops Claude Code.
- Orange means Claude needs you and green means running; nothing else in the shell uses those colours.

## What was removed

Quick layouts, saved layouts, Set size, the projects tile, project folding, New window and Move to window, as issue #28 says. The limits strip is hidden; each session still shows its own limit bars. The Visuals tile is reachable from the pane menu until step 4 (#30) replaces it. The multi-window code in `desktop/main.js` (`windowList`, `moveTile`, saved windows in `desktop/layoutstore.js`) is now unused and still present.

## Checked

Driven on 2026-11-18 in the packaged Linux app with a stand-in Claude Code: the list, one to four panes, the switch, closing, the green and orange dots and a live terminal in a pane. Screenshots: `docs/generated/shell-*.png`. A restart reopened the same panes and modes. Not checked: native drag (a synthetic drop was used) and Windows.
