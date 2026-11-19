# Accounts clean-up (Accounts box built in #44; badge and filter line not built yet)

Approved 2026-11-19 as "accounts clean-up 1A 2A 3A" (`docs/plans/accounts-cleanup.html`).

## What it owns

Hiding account folders Aj does not want listed, showing which account each session belongs to, and saying which accounts the session list covers.

## How it works

- **Why repeats happen.** `findAccounts` in `desktop/accounts.js` adds every `.claude` and `.claude-*` folder in the home folder that has a `projects` folder or a `.claude.json` sign-in file. Several folders signed in as the same person therefore show the same email.
- **Accounts box** (choice 1A, built in #44: `site/js/accountsdialog.js:9`, More item `site/js/main.js:194`, same-email note `sameEmailNotes` at `site/js/accounts.js:5`). Row colour is not built; rows show email, folder, session count, Hide. Opened from More, then Accounts…. It has one row per folder: colour, email, folder name, session count, and Hide. A folder whose email matches another folder's email gets a note naming that folder. Hidden folders are kept in the app's own `hidden-accounts.json` in its user-data folder, and `listAccounts` leaves them out. They are listed under Hidden, each with Show again. Nothing in a Claude folder changes.
- **Badge** (choice 2A, not built; the New sessions use folder-name suffix is built at `site/js/main.js:193`). Every session row's second line starts with a badge in the account's colour, showing the part of the email before the @, then the project and the time. In the More menu, New sessions use lines add the folder name when two folders share an email.
- **Filter line** (choice 3A, not built). It sits at the top of the session list and reads "All accounts (N) · M sessions". Picking one account narrows the list, and the line then names that account in its colour. The choice is remembered per window.

## Invariants

- Hide never deletes or edits a folder: the list is saved by `desktop/hiddenaccounts.js:25` in userData, filtered in `accounts()` at `desktop/main.js:58`, IPC `listAllAccounts` / `setAccountHidden` at `desktop/main.js:306,314` (PC only, not on the phone link).
- A hidden account's sessions never appear in the list, the Needs-you group, or the phone link.

## Unverified

Aj's real folders: which folders repeat, and why.
