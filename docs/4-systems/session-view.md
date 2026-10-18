# Session view

**Status: built, in QA.** Approved on 2026-10-18 ("Design approved: router redesign 1A 2A 3A", "Build plan approved: router redesign 1A 2A"). Build contract: `docs/plans/router-redesign-spec.md`.

## What it owns

- The folding, searchable project list down the left side, which replaces the board's columns.
- The open session on the right: a header with the three bars and the resume buttons, a readable view of the conversation, and in the Windows app a terminal panel running the real Claude Code.
- The limits strip along the top.

## How it works

- **List.** Projects are listed newest activity first, each with its colour stripe. Folding state and the search text are kept per viewer in `localStorage`. Sessions older than seven days sit under a folded "Older" heading inside their project. Search matches project name, session title and folder, case-insensitively, as you type.
- **Titles.** `titles.js` skips text that Claude Code inserts on its own, such as `<task-notification>` and `<local-command-caveat>`, so a title comes from the first thing the person typed.
- **Readable view.** `transcript.js` turns the transcript's lines into you / Claude / tool entries. The view re-reads only the bytes appended since its last read, every 2 seconds while open, so it follows a working session live. Built in `site/js/sessionview.js` (styles in `site/sessionview.css`). Differences from the plan: tool entries also carry the tool's `id` (to match results that arrive in a later line); a slash command shows as its cleaned text; a line cut by a chunk boundary waits in `state.rest` (`appendTranscript`); sessions now carry `file` and `projectDir` so the view can read them; the demo source grows its canned conversation by one exchange every 4 seconds; "Resume here" fires a `router:resume-here` window event until the terminal panel is built, and `#terminal-slot` (hidden) is where that panel will go.
- **Terminal panel (app only).** `desktop/pty.js` runs `claude --resume <id>` (or `claude` for a new session) inside a pseudo-terminal from `node-pty`, with `CLAUDE_CONFIG_DIR` set for the session's account the same way `desktop/launch.js` does. The page draws it with xterm.js. Because it is the real Claude Code, permission prompts and slash commands work as in any terminal.
  Built: `site/js/terminal.js` (`createPanels`, exposed as `source.createPanels` by `site/js/sources/desktop.js`; browser and demo sources have none). It loads `site/vendor/xterm/` on first use and keeps one xterm Terminal per session key (`accountId|sessionId`, or `new:<n>`). "Resume here" opens or reattaches the panel under the conversation; opening another session hides it and leaves the process running (plan choice 1A), and coming back puts the same element back. "New session" in the list opens a panel in the right pane headed "New session in <project>". A start error such as Claude Code not found is written in the panel; when the process ends the panel says "Claude Code has stopped. Resume here to start it again." A session whose panel process is running gets the working dot in the list. "Open in Windows Terminal" stays as a second button. The session title goes into `ptyOpen`, so the quit prompt (choice 2A) names sessions by title. The `router:resume-here` event is no longer fired. Not built: the two-writers warning line in the panel header. The top bar keeps "Add Claude folder" and "Help" on the first row at 1000px and wider.
- **Why not the Claude desktop app.** It can't be opened at a chosen session from outside, and Claude Code's `claude-cli://` links only start new sessions (https://code.claude.com/docs/en/deep-links). Its own session list doesn't show terminal sessions and only covers the account it is signed in to.
- **Why not the Agent SDK.** A chat screen built on Anthropic's Agent SDK would offer the person's subscription login through a third-party app, which Anthropic's terms don't allow without approval.

## Limits strip

`site/js/strip.js` draws the strip in the top bar, between the status line and the buttons. It names the Claude folder a new session would use (the one with the most room that the router can read, from `limits.accountForNewSession`), shows that folder's 5-hour and weekly bars with percent and reset time, and wraps under the title on narrow screens. When a folder has limit tracking off, one "Turn on limit tracking" button turns it on for every such folder (`planReporterAll` picks them; folders still needing permission are skipped); failures are reported in one notice naming the folders. With tracking on but no reading yet, the strip says "Waiting for Claude's next reply". The list rows carry no limit buttons.

## Traps

- A session open in an outside terminal and in the panel at the same time has two writers to one transcript. The panel's header says so when the transcript changes while the panel's own process is idle.
- `node-pty` is a native module: it must stay out of the asar archive, and it only has prebuilt binaries for Windows and macOS. Linux (used for checks here) compiles it on install.
