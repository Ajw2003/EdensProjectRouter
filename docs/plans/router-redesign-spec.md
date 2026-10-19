# Router redesign build spec

The build contract for the redesign Aj approved on 2026-10-18 with "Design approved: router redesign 1A 2A 3A" (design page: `docs/plans/router-redesign.html`):

- 1A: real Claude Code runs in a terminal panel inside the app, with the readable conversation view beside it.
- 2A: the list sits on the left and the open session on the right.
- 3A: each session row shows its title, time and a small context bar, and limits show once at the top.

It extends `docs/plans/router-build-spec.md`. Where the two disagree, this file wins. System doc: `docs/4-systems/session-view.md`.

## What changes, what stays (parity inventory)

| Today (file) | Keep / change / drop |
|---|---|
| Board of project columns (`site/js/board.js` `renderBoard`) | **Change**: replaced by the list (`site/js/list.js`). `board.js` keeps its pure helpers (`relativeTime`, `resetText`, `barLevel`, `resumeLine`), which the list and the session header import. `renderBoard` and `layoutKey` are dropped once the list renders. |
| Three bars on every card | **Change**: rows show context only. 5-hour and weekly bars move to the top strip and to the open session's header. |
| "Turn on limit tracking" on every card | **Change**: one "Turn on limit tracking" button in the top strip turns it on for every account that has it off. The walkthrough step stays. |
| Copy resume line, Resume | **Keep**: both move into the open session's header. In the app, Resume opens the terminal panel; "Open in Windows Terminal" stays as a secondary button (today's `router:resume`). |
| New session here (per project) | **Keep**: a "New session" button on each project row and one in the top bar. In the app it opens the terminal panel on the account with most room (`limits.accountForNewSession`). |
| Project colours, grouping, account discovery, reporter, walkthrough, website, installer | **Keep** unchanged. |
| "Running now" mark (`claudeRunning`) | **Change**: a row shows "working now" when its transcript changed in the last 30 seconds, or when its terminal panel is open and running. 30 seconds is a chosen threshold, not a measured one. |

## Layout

```
site/js/
  titles.js        pure: cleanTitle(text) - skips <task-notification>, <local-command-caveat>, <command-name> etc.
  list.js          renders the folding, searchable project list (left column)
  transcript.js    pure: parseTranscript(text) -> [{kind, ...}] for the readable view
  sessionview.js   renders the open session: header, readable view, and (app only) the terminal panel slot
  strip.js         renders the top limits strip
site/vendor/xterm/ copied from @xterm/xterm and @xterm/addon-fit by desktop/scripts/copy-vendor.js (app only, not committed)
desktop/
  pty.js           starts and owns node-pty processes, one per open session
```

## Data

`parseTranscript(text)` returns entries, oldest first:

- `{kind:"you", text, at}` from `user` lines whose content is a string or text blocks, skipping `isMeta` lines and text starting with a system tag.
- `{kind:"claude", text, at}` from `assistant` text blocks. Thinking blocks are left out.
- `{kind:"tool", name, summary, detail, at}` from `assistant` `tool_use` blocks. The summary is one line: `Edited <file>`, `Ran <command first 80 chars>`, `Read <file>`, else `<tool name>`. The matching `tool_result` becomes `detail`, cut to 4 KB.
- Other line types (`attachment`, `mode`, `system`, `queue-operation`, ...) are skipped. Lines that aren't valid JSON are counted, not shown.

The session view reads the whole transcript once, then re-reads only the bytes added since (by file size) every 2 seconds while open. Files over 5 MB show the last 5 MB with a "Show earlier" button.

## Desktop additions

New IPC calls, each exposed on `window.routerDesktop`:

```
readTranscript(accountId, project, file, fromByte) -> {text, size}
ptyOpen({sessionId|null, cwd, accountId, cols, rows}) -> ptyId   // claude --resume <id>, or claude, with CLAUDE_CONFIG_DIR set as launch.js does
ptyWrite(ptyId, data); ptyResize(ptyId, cols, rows); ptyClose(ptyId)
onPtyData(cb(ptyId, data)); onPtyExit(cb(ptyId, code))
```

- `node-pty` 1.1.0 (MIT) ships Windows prebuilt binaries, so electron-builder needs no compiler. It is unpacked from the asar archive (`asarUnpack: node_modules/node-pty/**`).
- `@xterm/xterm` 6.0.0 and `@xterm/addon-fit` 0.11.0 (MIT) draw the terminal.
- On Windows the panel starts `claude.cmd`/`claude.exe`, whichever `where claude` finds first. If neither is found, the panel says Claude Code wasn't found and the board still works.
- Choosing another session leaves the panel's process running in the background (build plan choice 1). Closing the app asks first when a panel process is still running (build plan choice 2).

## Tests

- Unit (Node, `tests/`): `cleanTitle`, `parseTranscript` (fixtures from a real transcript's record types), list filtering and folding state, the strip's "turn on for all" plan, and the pty command builder.
- Windows CI: a new step runs `node-pty` under Electron's Node, spawning `cmd /c echo router-ok` and checking the output.
- Driven here: the packaged Linux build is clicked through with Playwright against a fake home: search, fold, open a session, see the readable view update when the transcript grows, open the terminal panel on a fake `claude` script and type into it.
