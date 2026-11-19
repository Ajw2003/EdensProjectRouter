# Today — 2026-11-18

**Done:** wrote and got approval for the desktop and phone companion plan (`docs/plans/companion-app.html`). Found that the plan missed the 0.3.0 app on `AjsAgent/project-thread-lle0v5`, wrote a correction page (`docs/plans/companion-rebase.html`), and got it approved (1A 2A 3A). Merged the 0.3.0 app into this session's branch, `ccr-b76fb27e-nuy8j2`.

**2026-11-19:**
- Steps 1 to 4 are merged.
- Step 6, accounts (#32), is merged. It adds a New session box with a Suggested account, an orange Continue button on a full account, and a refusal for an account already added. It was driven in the packaged Linux app with two fake accounts, and the screenshots are in `docs/generated/accounts-*.png`.
- Step 5, the ADHD and autism layer (#31), is on `worktree-agent-a193a2a8a751bbc35`. Its app check is running again after a fix that makes long menus scroll instead of running off the window.

**2026-11-19, later:** step 9 (#34) is built on `AjsAgent/lucid-dirac-2t9c5y`: a Help page replaces the walkthrough, and the version is 0.4.0. The Windows workflow passes after a phone link test fix. The QA page is `docs/plans/companion-qa.html`, and every issue under #35 is in needs review.

**Next, in order (earlier list, kept for the record):**
1. Merge step 5 and run `npm test` on the merged branch.
2. Build step 7, the phone link (#37).
3. Build step 8, the Android app (#38), with a GitHub workflow. This machine cannot build it: the proxy refuses Google's download server, and there is no emulator support.
4. Build step 9, the Help page, the QA page and version 0.4.0 (#34).
5. Close #26 and #27 once aj names them.
