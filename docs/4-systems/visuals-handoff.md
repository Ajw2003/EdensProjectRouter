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

## Traps

- `.router-handoff` is kept in git by default because Aj backs projects up with git; the toggle edits `.git/info/exclude`, which git never commits.
- Claude Code never draws pictures in a terminal, so a terminal image add-on would not help; visuals come from files.
