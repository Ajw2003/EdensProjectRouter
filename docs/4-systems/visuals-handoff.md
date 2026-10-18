# Visuals and hand-off

**Status: planned.** Approved on 2026-10-18 ("Design approved: router visuals and handoff 1A 2A 3C 4* 5*"). Build contract: `docs/plans/router-grid-spec.md`, sections 5 to 8. Windows app only.

## What it owns

- The Visuals tile for each project: pictures, video, PDF, Markdown and web pages that its sessions write or show, and claude.ai artifact links.
- The Show tool, a small MCP server that lets Claude put a file on screen on purpose.
- Sending a page's copied reply into the session that made it.
- Send to: files, pages and conversations into an open session, a new session or a sub-session (a `--fork-session` branch).
- Ask another session: free by default, or a read-only copy that spends usage when Aj chooses it.
- The `.router-handoff` folder in each receiving project and its "Keep hand-off files out of git" toggle.

## How it works

- Visuals are found from transcript tool calls (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`) by file extension, plus Show tool entries from `%APPDATA%\Project Router\shows.jsonl`.
- Web pages run in a walled-off webview with no Node access. Its preload reports text the page copies, which adds the Send button.
- Sent text is typed into the session's terminal without Enter, so Aj always presses Enter.
- Usage-spending runs (summary, Ask's read-only copy) use `claude -p --resume <id> --fork-session --no-session-persistence --tools Read,Grep,Glob`, so the source session is never changed.

## Built

Issue #19 (2026-10-18), branch `worktree-agent-a2804488babdab268`: the `visuals` tile (`site/js/tiles/visuals.js`), `visualsfind.js`, `markdownview.js`, the `router-file://` protocol, page and artifact webviews, the dot on project rows and the Show tool server (`desktop/showtool/server.cjs`) with a per-account "Turn on Show tool" button in the Visuals tile (not the account menu, which another builder owns). The session tile header has no Visuals icon, to avoid clashing with the accounts work. The app reads `shows.jsonl` on the tile's 3 s refresh rather than with a file watcher. Not yet run: `claude mcp add` against a real Claude Code, the PDF viewer, a real Windows install.

Issue #20 (2026-10-18): a page's copied reply goes to its session. `desktop/pagepreload.cjs` wraps `navigator.clipboard.writeText` in the page's main world (the wrapper only fires a DOM event the preload reports with `sendToHost('router:copied')`) and listens for `copy` events. The Visuals tile shows a bar above the page: "Send to <title>" for the newest session whose transcript wrote it, or "Send to…" with the open session tiles when none is known. Send types the text with no Enter (`site/js/sendreply.js`, pure and tested); a stopped session is resumed in its tile and typed into after 1.5 s of quiet output (cap 20 s); a session running in another window is typed into through main's `ptyWrite`, and its tile cannot be focused from here. Driven on Linux with the fake claude, running and stopped: the text sat on the prompt line unsubmitted, Enter then echoed it. Not run: two windows, real Claude Code's prompt.

## Traps

- `.router-handoff` is kept in git by default because Aj backs projects up with git; the toggle edits `.git/info/exclude`, which git never commits.
- Claude Code never draws pictures in a terminal, so a terminal image add-on would not help; visuals come from files.
