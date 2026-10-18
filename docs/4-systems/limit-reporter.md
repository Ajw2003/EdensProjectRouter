# Limit reporter (planned, not built)

## What it owns

Getting the 5-hour session limit, the weekly limit and exact context use out of Claude Code and into a file the site can read.

## How it works (planned)

Claude Code does not write limit numbers to disk. It hands them, as JSON on standard input, to whatever command is set as `statusLine` in the account's `settings.json`. Fields used: `rate_limits.five_hour.used_percentage` and `.resets_at`, `rate_limits.seven_day.used_percentage` and `.resets_at`, `context_window.used_percentage`, `session_id`, `transcript_path`, `cwd`, and `workspace.repo.name`. (Schema read from Claude Code 2.1.302's own status line documentation, 2026-10-18.)

When Aj taps "Turn on limit tracking" for an account, the site (with write permission for that folder):

1. Copies `settings.json` to `settings.json.router-backup`.
2. Sets `statusLine` to a PowerShell command passed as `-EncodedCommand`, so no script path or quoting is needed. If a status line already existed, its command is kept in `router\previous-statusline.txt` and the reporter runs it and prints its output, so Aj's existing status line keeps working.
3. The reporter writes the JSON it received to `router\status\<session id>.json` inside the same account folder (found from `transcript_path`), then prints a short line such as `ctx 34% · 5h 12% · week 40%`.

"Turn off" restores the backup.

## Invariants

- The reporter never fails Claude Code: any error is written to `router\reporter-errors.log` and it still prints a line.
- It runs on Windows PowerShell 5.1, which ships with Windows.

## Traps

- The limits only appear for claude.ai subscribers and only after the first reply in a session.
