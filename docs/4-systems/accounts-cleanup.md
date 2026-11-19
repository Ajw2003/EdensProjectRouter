# Accounts clean-up (Accounts box built in #44; badge and filter line built in #45)

Approved 2026-11-19 as "accounts clean-up 1A 2A 3A" (`docs/plans/accounts-cleanup.html`).

## What it owns

Hiding account folders Aj does not want listed, showing which account each session belongs to, and saying which accounts the session list covers.

## How it works

- **Why repeats happen.** `findAccounts` in `desktop/accounts.js` adds every `.claude` and `.claude-*` folder in the home folder that has a `projects` folder or a `.claude.json` sign-in file. Several folders signed in as the same person therefore show the same email.
- **Accounts box** (choice 1A, built in #44: `site/js/accountsdialog.js:9`, More item `site/js/main.js:194`, same-email note `sameEmailNotes` at `site/js/accounts.js:5`). Each row starts with a coloured dot (`site/js/accountsdialog.js:25`), then email, folder, session count, Hide. Opened from More, then Accounts…. It has one row per folder: colour, email, folder name, session count, and Hide. A folder whose email matches another folder's email gets a note naming that folder. Hidden folders are kept in the app's own `hidden-accounts.json` in its user-data folder, and `listAccounts` leaves them out. They are listed under Hidden, each with Show again. Nothing in a Claude folder changes.
- **Badge** (choice 2A, built in #45: `accountBadge` at `site/js/sessionlist.js:54`, colour `accountColor` at `site/js/accounts.js:84`, text `badgeText` at `site/js/accounts.js:91`; the New sessions use folder-name suffix is built at `site/js/main.js:193`). Every session row's second line starts with a badge in the account's colour, showing the part of the email before the @, then the project and the time. In the More menu, New sessions use lines add the folder name when two folders share an email.
- **Filter line** (choice 3A, built in #45: `drawFilter` at `site/js/shell.js:91`, menu at `site/js/shell.js:103`, words `filterSummary` at `site/js/accounts.js:101`, remembered by `loadFilter` at `site/js/accounts.js:112`, narrowing in `splitDay` and the Needs-you group in `site/js/sessionlist.js`). It sits at the top of the session list and reads "All accounts (N) · M sessions". Picking one account narrows the list, and the line then names that account in its colour. The choice is remembered in localStorage under `router.filterAccount` (the page has no window id, so it is not yet per window); an account that is gone or hidden falls back to All.

## Owners and login grouping (steps 1 and 2 of the desktop-owner plan)

- **Problem.** The Claude desktop app writes every transcript into `~/.claude/projects`, whatever account it ran under, so everything showed under `.claude`. The owner is recorded only in small files in the desktop app's data: `%LOCALAPPDATA%\Claude-Data\<package id>\claude-code-sessions\<accountUuid>\<orgUuid>\local_*.json` (also in `backlog` and `waiting-input`). The account is the folder name; the transcript is `<cliSessionId>.jsonl`.
- **Reader** (`desktop/desktopowners.js`, IPC `listDesktopOwners`, phone table too). Returns `{ sessions: { cliSessionId: accountUuid }, accounts: [accountUuid] }`. It reads only each file's `cliSessionId` value (files without one are settings files and are skipped), tolerates broken files with a warning, and never writes. `ROUTER_DESKTOP_DATA` replaces the base folder (tests, checks); on other platforms or when absent the result is empty. A login whose folders are all hidden is dropped from `accounts`.
- **Login of a folder** (`readLogin` in `desktop/accounts.js`): `oauthAccount.emailAddress` and `.accountUuid` from the folder's `.claude.json`, for `.claude` also from `~/.claude.json`. `listAccounts` and `listAllAccounts` return `accountUuid`.
- **Grouping** (`loginKey`, `groupLogins`, `site/js/accounts.js`): folders with the same login (uuid, else lower-cased email, else the folder id) become one display account, the primary being `.claude` if present, else the first by name; `memberIds` lists the others. If the primary is hidden, the next visible folder is primary.
- **`ownerId(session, accounts, desktop)`**: for DISPLAY only (badge, colour, filter line and counts, filter menu, "All accounts (N)"). The desktop record wins; otherwise the group primary of the folder that stores the transcript; a login with no folder becomes a synthetic `desktop-<last 6>` account (`desktopOnly`). `session.accountId` is unchanged and still drives resume, read, copy and cloud reads. New session and the strip list one entry per login and never a desktop-only one. The Accounts box still lists every folder, says "same login as <folder>" for folders of one login (`sameLoginNotes`; "same email as" when only emails are known), and shows "Desktop only login ...xxxxxx" rows with no Hide button.
- **Nothing is written** in any `.claude*` folder or the desktop app's data. Check on a real machine: `node desktop/scripts/check-real-accounts.cjs [home]` prints per display account the badge, masked email, last 6 of the login and session count.

## Invariants

- Hide never deletes or edits a folder: the list is saved by `desktop/hiddenaccounts.js:25` in userData, filtered in `accounts()` at `desktop/main.js:58`, IPC `listAllAccounts` / `setAccountHidden` at `desktop/main.js:306,314` (PC only, not on the phone link).
- A hidden account's sessions never appear in the list, the Needs-you group, or the phone link.

## Unverified

Aj's real folders: which folders repeat, and why. The badge and filter line have not been seen in the running app.
