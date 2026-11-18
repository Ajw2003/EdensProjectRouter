# Changelog

All notable changes to this project. Newest first.

## Unreleased

- Started visuals in the chat, the fourth build step: pictures and pages in the conversation, a Files panel and a Pages shelf (issue #30).
- Added a progress page for the first three build steps, with screenshots (`docs/plans/companion-progress.html`).
- Merged the Visual view and recorded it in the docs (`docs/4-systems/calm-shell.md`, `docs/4-systems/router-hub.md`, `docs/3-state/ProjectState.md`).
- Started the Visual view, the third build step: chat bubbles, action cards with a Why line, and question and permission cards (issue #29).
- Visual view on each pane: the session as a chat with one-line action cards (open for the Why line), question cards with one button per option and a box for your own answer, a permission card (Allow, Always allow in this project, Deny) and a reply box with Send, Stop and Attach; every tap is typed into the terminal as keys (issue #29; `site/js/visual.js`, `site/js/visualcards.js`, new `screenRead` IPC). Slash and @ menus skipped: you type them.

- Replaced the tile grid with the calm shell: a session list, one to four sessions side by side, a Terminal and Visual switch, and green and orange dots (issue #28; `site/js/shell.js`, `site/js/panes.js`, `site/js/pane.js`, `site/js/sessionlist.js`; dockview removed).
- The calm shell is built on a helper branch, not yet merged: the session list, panes and the restart memory were driven; the terminal inside a pane and the status dots are being re-checked (issue #28).
- Started the calm shell, the second build step: a session list and one to four sessions side by side, with a Terminal and Visual switch (issue #28).
- Noted in the Windows app doc why the launcher drops the child-session marker (`docs/4-systems/windows-app.md`).
- Sessions the app opens always save their transcript, even when the app was started from inside a Claude session, so the Visual view is never blank (`desktop/launch.js` removes `CLAUDE_CODE_CHILD_SESSION`).
- The real-Claude check passes: a tap sent as keys answered Claude Code 2.1.327's question, and its transcript recorded "Green" (`desktop/scripts/check-visual-keys.cjs`).
- Fixed a test that sometimes failed by sending its message twice (`tests/keys.test.js`; 170 tests, 167 pass, 3 skip, seven clean runs).
- Updated the project status: the real-Claude check now reaches Claude's question list (`docs/3-state/ProjectState.md`).
- The screen reader now reads Claude's real question list, which has a description under each option and a rule line before the last ones (`desktop/keys.js`, test from a real capture in `tests/keys.test.js`; 170 tests, 167 pass, 3 skip).
- The real-Claude check now answers setup lists by name, never with a blind Enter, after a blind Enter chose "No, exit" on the folder-trust question (`desktop/scripts/check-visual-keys.cjs`).
- The screen reader now reads the screen as a terminal draws it, and recognises unnumbered lists like the theme picker; the real-Claude check also passes "Enter to continue" screens (`desktop/screen.js`, `desktop/keys.js`, `desktop/scripts/check-visual-keys.cjs`, `@xterm/headless` 6.0.0 for tests; 169 tests, 166 pass, 3 skip).
- Found that the real Claude terminal loses its spaces when read raw, so the screen reader has to use the drawn screen; recorded as a trap (`docs/4-systems/router-hub.md`).
- Added the Visual view engine: transcript lines become messages, actions with a reason, questions, tasks and pages, and taps become terminal keys; the real-Claude check now answers first-run setup screens (`site/js/visualevents.js`, `desktop/keys.js`, `desktop/scripts/check-visual-keys.cjs`; 167 tests, 162 pass, 5 skip).
- Started building the companion: the build plan is approved, and the Visual view engine is the first step (issue #36).
- Linked the build-plan issues to the stage tracker, and kept a backup of this branch before rebuilding it (`.claude/house-rules-loop.json`, branch `AjsAgent/companion-backup`).
- Wrote the companion build plan: a parent issue and nine steps, three new and six kept from the calm redesign (`docs/plans/companion-build-plan.html`, issues #35 to #38).
- Rebuilt this branch on top of the Project Router 0.3.0 app so the companion builds on it (my document commits replayed onto `AjsAgent/project-thread-lle0v5`; 154 tests, 149 pass, 5 skip without PowerShell).
- Recorded your approval of the companion design with your picks (1A 2A 3A 4A 5B) in the decisions log (`docs/6-decisions/Decisions.md`, `.claude/house-rules-loop.json`).
- Added a correction page showing how the approved companion plan maps onto the existing Project Router 0.3.0 app, and a systems doc for the companion (`docs/plans/companion-rebase.html`, `docs/4-systems/router-hub.md`).
- Re-proposed the companion plan with a Terminal view and a Claude-app-style Visual view on both devices, plus seven features built around ADHD and autism (`docs/plans/companion-app.html`).
- Changed the companion plan to support any number of accounts, starting with four (`docs/plans/companion-app.html`).
- Added a plan for a Windows app and an Android companion app that share live Claude sessions across three accounts, waiting for approval (`docs/plans/companion-app.html`).
- Explained why the desktop app would be about 100 MB on the first design page (`docs/plans/router-prototype.html`).
- Rewrote the first design page in plainer English (`docs/plans/router-prototype.html`).
- Version 0.3.0 and earlier: see the commit history of `AjsAgent/project-thread-lle0v5`.
- Set up the project's documentation and wrote the first design page (`docs/`, `docs/plans/router-prototype.html`).
