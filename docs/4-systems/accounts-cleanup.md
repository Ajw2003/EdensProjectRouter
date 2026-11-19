# Accounts clean-up (Accounts box built in #44; badge and filter line built in #45)

Approved 2026-11-19 as "accounts clean-up 1A 2A 3A" (`docs/plans/accounts-cleanup.html`).

## What it owns

Hiding account folders Aj does not want listed, showing which account each session belongs to, and saying which accounts the session list covers.

## How it works

- **Why repeats happen.** `findAccounts` in `desktop/accounts.js` adds every `.claude` and `.claude-*` folder in the home folder that has a `projects` folder or a `.claude.json` sign-in file. Several folders signed in as the same person therefore show the same email.
- **Accounts box** (choice 1A, built in #44: `site/js/accountsdialog.js:9`, More item `site/js/main.js:194`, same-email note `sameEmailNotes` at `site/js/accounts.js:5`). Each row starts with a coloured dot (`site/js/accountsdialog.js:25`), then email, folder, session count, Hide. Opened from More, then Accounts…. It has one row per folder: colour, email, folder name, session count, and Hide. A folder whose email matches another folder's email gets a note naming that folder. Hidden folders are kept in the app's own `hidden-accounts.json` in its user-data folder, and `listAccounts` leaves them out. They are listed under Hidden, each with Show again. Nothing in a Claude folder changes.
- **Badge** (choice 2A, built in #45: `accountBadge` at `site/js/sessionlist.js:54`, colour `accountColor` at `site/js/accounts.js:84`, text `badgeText` at `site/js/accounts.js:91`; the New sessions use folder-name suffix is built at `site/js/main.js:193`). Every session row's second line starts with a badge in the account's colour, showing the part of the email before the @, then the project and the time. In the More menu, New sessions use lines add the folder name when two folders share an email.
- **Filter line** (choice 3A, built in #45: `drawFilter` at `site/js/shell.js:91`, menu at `site/js/shell.js:103`, words `filterSummary` at `site/js/accounts.js:101`, remembered by `loadFilter` at `site/js/accounts.js:112`, narrowing in `splitDay` and the Needs-you group in `site/js/sessionlist.js`). It sits at the top of the session list and reads "All accounts (N) · M sessions". Picking one account narrows the list, and the line then names that account in its colour. The choice is remembered in localStorage under `router.filterAccount` (the page has no window id, so it is not yet per window); an account that is gone or hidden falls back to All.

## Invariants

- Hide never deletes or edits a folder: the list is saved by `desktop/hiddenaccounts.js:25` in userData, filtered in `accounts()` at `desktop/main.js:58`, IPC `listAllAccounts` / `setAccountHidden` at `desktop/main.js:306,314` (PC only, not on the phone link).
- A hidden account's sessions never appear in the list, the Needs-you group, or the phone link.

## Unverified

Aj's real folders: which folders repeat, and why. The badge and filter line have not been seen in the running app.
