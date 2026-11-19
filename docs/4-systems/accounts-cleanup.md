# Accounts clean-up (planned, not built)

Approved 2026-11-19 as "accounts clean-up 1A 2A 3A" (`docs/plans/accounts-cleanup.html`).

## What it owns

Hiding account folders Aj does not want listed, showing which account each session belongs to, and saying which accounts the session list covers.

## How it works (planned)

- **Why repeats happen.** `findAccounts` in `desktop/accounts.js` adds every `.claude` and `.claude-*` folder in the home folder that has a `projects` folder or a `.claude.json` sign-in file. Several folders signed in as the same person therefore show the same email.
- **Accounts box** (choice 1A). Opened from More, then Accounts…. It has one row per folder: colour, email, folder name, session count, and Hide. A folder whose email matches another folder's email gets a note naming that folder. Hidden folders are kept in the app's own `hidden-accounts.json` in its user-data folder, and `listAccounts` leaves them out. They are listed under Hidden, each with Show again. Nothing in a Claude folder changes.
- **Badge** (choice 2A). Every session row's second line starts with a badge in the account's colour, showing the part of the email before the @, then the project and the time. In the More menu, New sessions use lines add the folder name when two folders share an email.
- **Filter line** (choice 3A). It sits at the top of the session list and reads "All accounts (N) · M sessions". Picking one account narrows the list, and the line then names that account in its colour. The choice is remembered per window.

## Invariants

- Hide never deletes or edits a folder.
- A hidden account's sessions never appear in the list, the Needs-you group, or the phone link.

## Unverified

Aj's real folders: which folders repeat, and why.
