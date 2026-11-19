# Cloud sessions (reader built; list, pane and refresh planned)

Approved 2026-11-19 as "cloud sessions list 1A 2A 3A" (`docs/plans/cloud-sessions-list.html`).

## What it owns

Listing each account's claude.ai/code cloud sessions in the session list beside local ones. It also owns opening a cloud session on claude.ai, copying one to this PC, and telling Aj when an account's sign-in has expired.

## How it works (planned)

- **Reader** (built, issue #40: `createCloudReader` at `desktop/cloud.js:24`, `readAccount` at `desktop/cloud.js:25`, IPC `listCloudSessions` at `desktop/main.js:294`, base URL overridable by `ROUTER_CLOUD_BASE` for tests only, tests in `tests/cloud.test.js`; it returns `{state: ok|no-sign-in|expired|error, message, sessions}` per account, with a 15 s timeout). Planned behaviour: `desktop/cloud.js`, main process. For each account folder, it reads `<folder>/.credentials.json` → `claudeAiOauth.accessToken` and `expiresAt`. It never writes that file. It calls `GET https://api.anthropic.com/v1/code/sessions` with the headers `Authorization: Bearer <token>`, `anthropic-version: 2023-06-01` and `Content-Type: application/json`, the same call Claude Code 2.1.328's teleport picker makes (function `SRi` in its bundle). From each entry in `data` it keeps `id`, `title`, `status`, `worker_status`, `created_at`, `last_event_at`, `environment_kind` and the repository (`config.sources[]` with `type: "git_repository"`, owner and name parsed from its `url`). It drops archived entries, and refreshes every 30 seconds.
- **List** (built, issue #41: `cloudToSessions` at `site/js/cloudlist.js:5`, polled every 30 s per account by `createCloudCache` at `site/js/cloudlist.js:22` and called from `site/js/main.js:283`, row at `site/js/sessionlist.js:61`; each account's `{state, message}` is on the model as `cloudStates`). Choice 1A. A cloud session joins its project group by repository name and gets a cloud icon, with "cloud" and its status in the second line.
- **Pane** (choice 2A). Tapping a cloud session opens a pane with its title, repository and status, plus two buttons. **Open on claude.ai** opens `https://claude.ai/code/<id>` in the browser. **Continue on this PC** runs `claude --teleport <id>` in that account, in a new terminal pane.
- **Expired sign-in** (choice 3A). A token past `expiresAt`, or a 401 answer, marks the account "Sign-in out of date", with a Refresh button. Refresh runs `claude auth status` in that account, then reads again.

## Invariants

- Nothing writes into a Claude folder. Tokens are read, sent only to `api.anthropic.com`, and never logged or shown.
- A failed or refused call is shown on that account's line in plain words. It never stops local sessions from listing.

## Unverified

- The endpoint has not been called with a real token, because the build machine has no signed-in account. Its shape comes from Claude Code's bundle, not from documentation, and it can change without notice.
- Whether `claude auth status` renews an expired token.
- How long tokens last.
