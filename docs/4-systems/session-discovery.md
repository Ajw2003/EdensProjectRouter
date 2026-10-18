# Session discovery (planned, not built)

## What it owns

Finding every Claude Code session for each configured account, and grouping those sessions by project (Git repository name, or folder name when the folder is not a Git repository).

## How it works (planned)

Claude Code keeps one config folder per account. The default is `%USERPROFILE%\.claude`; a second or third account uses a different folder chosen with the `CLAUDE_CONFIG_DIR` environment variable. Inside each config folder, `projects\<encoded folder path>\<session id>.jsonl` holds one transcript per session. Each line of a transcript is JSON and carries `cwd` (the folder the session ran in), `gitBranch`, `timestamp` and `sessionId`; a line of type `ai-title` or `summary` carries a readable title.

This layout was read from a real Claude Code install on 2026-10-18 (Linux, in the agent's sandbox); it has not yet been checked on Windows.

## Invariants

- Discovery only reads. It never writes into a Claude config folder.
- A missing or empty config folder is an empty account, never an error that stops the app.

## Traps

None recorded yet.
