# Session discovery

## What it owns

Turning each account folder into a list of sessions, grouping sessions from every account by project, and working out each session's context use.

## How it works

Code: `site/js/discovery.js`, used by `site/js/main.js`.


Inside each account folder, `projects\<encoded folder path>\<session id>.jsonl` holds one transcript per session. Each line is JSON. Lines carry `cwd` (the folder the session ran in), `gitBranch`, `timestamp` and `sessionId`; a line of type `ai-title` carries a readable title. Assistant lines carry `message.usage` (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`) and `message.model`.

- **Project name:** the last part of `cwd`. Sessions from every account with the same `cwd` land in the same project column. Git repository names come from the limit reporter's `workspace.repo.name` when it has run; otherwise the folder name is used.
- **Context use:** the newest assistant line's input, cache-read and cache-creation tokens added together, divided by the model's window (1,000,000 for a model ID ending `[1m]`, otherwise 200,000). When the limit reporter has a reading for the session, its exact `context_window.used_percentage` is used instead.
- **Freshness:** files are re-read every 5 seconds; only files whose size changed are parsed again, and only their last 256 KB is read.

This layout was read from a real Claude Code install (version 2.1.302) on 2026-10-18 on Linux; it has not been checked on Windows.

## Invariants

- Discovery only reads.
- A line that is not valid JSON is skipped and counted; the count shows in the folder's details, so nothing fails silently.

## Traps

None recorded yet.
