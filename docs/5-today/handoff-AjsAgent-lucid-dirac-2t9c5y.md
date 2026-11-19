# Handoff: companion build on AjsAgent/lucid-dirac-2t9c5y

## What the work is for

The desktop and phone companion, plus two features added after the failed 0.4.0 QA: cloud sessions in the session list and an accounts clean-up. The companion is for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on the PC and the phone, every account usable without switching, a phone link that needs no Remote Control, and a Help page in place of the first-run walkthrough.

## Where it stands

All nine steps under #35 are built on `AjsAgent/lucid-dirac-2t9c5y`, which continues `ccr-b76fb27e-nuy8j2`. Version 0.4.0 is set for the Windows app and the Android app. There are 199 tests: 196 pass, 0 fail and 3 are skipped on Linux. GitHub's Windows workflow (run 60) passed every step and built the installer. The Android workflow built the APK in run 14; run 15 hit a download error at Maven Central and was re-run. The QA page is `docs/plans/companion-qa.html`.

## The next step

QA of 0.4.0 failed. Fixed since then, each checked: untitled sessions (`site/js/discovery.js`), pictures in the chat, the Files panel layout, and Claude Code notices shown as typed by Aj (205 tests: 202 pass, 0 fail, 3 skipped). The cloud sessions design is published for Aj as a web page (source `docs/plans/cloud-sessions-list.json`). Aj approved both the cloud sessions design and the accounts clean-up (`docs/plans/accounts-cleanup.json`), each 1A 2A 3A. Aj approved the build plan (`docs/plans/cloud-sessions-build-plan.json`) for both. #40 (cloud reader, `desktop/cloud.js`) is merged: 214 tests, 211 pass, 0 fail, 3 skipped. #44 (Accounts box, `site/js/accountsdialog.js`, `desktop/hiddenaccounts.js`) is merged and driven in the real app with three fake folders: the same-email note, Hide, kept hidden after a restart, and Show again all worked (`docs/generated/accounts-box.png`). 218 tests: 215 pass, 0 fail, 3 skipped. #45 (account badges and the filter line) is merged and driven in light and dark with three fake accounts: three distinct badge colours, 'All accounts (3) · 3 sessions', narrowing to 'work only · 1 session' and back (`docs/generated/accounts-*.png`). 223 tests: 220 pass, 0 fail, 3 skipped. The filter choice is shared by all windows, not per window. #41 (cloud rows and the cloud pane, `site/js/cloudlist.js`, `site/js/cloudpane.js`, `buildTeleportCommand` in `desktop/launch.js`) is merged: 230 tests, 227 pass, 0 fail, 3 skipped. Driven in the real app against a stand-in server: cloud rows with badges, archived hidden, token only in the Authorization header, Open on claude.ai opened the session's page, Continue ran `claude --teleport <id>` in the local copy, and a repo with no local copy disabled Continue (`docs/generated/cloud-pane.png`). #42 (expired sign-in notice with Refresh, `cloudNotice` in `site/js/cloudlist.js`, `buildAuthStatusCommand` in `desktop/launch.js`) is merged: 233 tests, 230 pass, 0 fail, 3 skipped. Its real-app drive (expired token, Refresh with a stand-in claude) is running. Next: read that drive, then one QA page for everything since the failed 0.4.0 QA, then move #39 to #45 to needs review. Wait for a screenshot of the broken Android screen before changing the Android layout.

## What is unverified

The cloud endpoint `GET /v1/code/sessions` with a real token (no signed-in account here), whether `claude auth status` renews an expired token, what is broken in the Android app, Aj's real signed-in accounts, a real Continue between two accounts, the APK on a real phone (camera, notifications, battery, background pause), and real Claude Code behind the phone link.

## Issues

#35 parent. #28, #29, #30, #31, #32, #34, #36, #37 and #38 are in needs review. #26 and #27 wait to be closed until Aj names them. New: #39 (cloud sessions, steps #40, #41, #42) and #43 (accounts clean-up, steps #44, #45), all in progress.
