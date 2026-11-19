# Today — 2026-11-18

**Done:** wrote and got approval for the desktop and phone companion plan (`docs/plans/companion-app.html`). Found that the plan missed the 0.3.0 app on `AjsAgent/project-thread-lle0v5`, wrote a correction page (`docs/plans/companion-rebase.html`), and got it approved (1A 2A 3A). Merged the 0.3.0 app into this session's branch, `ccr-b76fb27e-nuy8j2`.

**2026-11-19:**
- Steps 1 to 4 are merged.
- Step 6, accounts (#32), is merged. It adds a New session box with a Suggested account, an orange Continue button on a full account, and a refusal for an account already added. It was driven in the packaged Linux app with two fake accounts, and the screenshots are in `docs/generated/accounts-*.png`.
- Step 5, the ADHD and autism layer (#31), is on `worktree-agent-a193a2a8a751bbc35`. Its app check is running again after a fix that makes long menus scroll instead of running off the window.

**2026-11-19, later:** step 9 (#34) is built on `AjsAgent/lucid-dirac-2t9c5y`: a Help page replaces the walkthrough, and the version is 0.4.0. The Windows workflow passes after a phone link test fix. The QA page is `docs/plans/companion-qa.html`, and every issue under #35 is in needs review. The QA page had an editor pass, and the handoff note is `docs/5-today/handoff-AjsAgent-lucid-dirac-2t9c5y.md`.

**2026-11-19, ready for QA:** all five steps (#40, #41, #42, #44, #45) are merged and run through in the real app. Version 0.4.1, QA page `docs/plans/router-041-qa.html`.

**2026-11-19, build progress:** #40 (cloud reader), #44 (Accounts box) and #45 (badges and filter line) are merged and checked. #41 (cloud rows and pane) is merged and checked in the real app against a stand-in server (`docs/generated/cloud-pane.png`). #42 (expired sign-in notice) is being built by a helper. 230 tests, 227 pass, 0 fail, 3 skipped.

**2026-11-19, build:** Aj approved the build plan for both features. #44 (Accounts box) and #40 (cloud reader) are being built by helpers; #45, #41 and #42 follow.

**2026-11-19, plans:** Aj approved both designs (1A 2A 3A each). Issues #39 to #45 are made, and the build plan page `docs/plans/cloud-sessions-build-plan.html` waits for approval.

**2026-11-19, accounts:** Aj found the same email listed several times, no way to remove an account, and no sign of which account a session is in. The cause: the app adds every `.claude-*` folder that has sessions or a sign-in file. A design page, `docs/plans/accounts-cleanup.html`, waits for approval.

**2026-11-19, later still:** Aj found two more problems while using the app, the Files panel's layout and pictures that never showed in the chat. Both are fixed and checked in the real app (`docs/generated/pictures-in-chat.png`, `docs/generated/files-panel-lines.png`). There are 205 tests: 202 pass, 0 fail and 3 are skipped.

**2026-11-19, after QA:** Aj's QA of 0.4.0 failed. Untitled sessions are fixed and pushed. The cloud sessions design (`docs/plans/cloud-sessions-list.html`) is published as a claude.ai page with its picture, because the local file's picture broke in the desktop app, and waits for approval; and the Android fix waits for a screenshot.

**Next, in order (earlier list, kept for the record):**
1. Merge step 5 and run `npm test` on the merged branch.
2. Build step 7, the phone link (#37).
3. Build step 8, the Android app (#38), with a GitHub workflow. This machine cannot build it: the proxy refuses Google's download server, and there is no emulator support.
4. Build step 9, the Help page, the QA page and version 0.4.0 (#34).
5. Close #26 and #27 once aj names them.
