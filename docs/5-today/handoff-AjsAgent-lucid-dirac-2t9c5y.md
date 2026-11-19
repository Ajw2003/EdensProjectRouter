# Handoff: companion build on AjsAgent/lucid-dirac-2t9c5y

## What the work is for

The desktop and phone companion for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on the PC and the phone, every account usable without switching, a phone link that needs no Remote Control, and a Help page in place of the first-run walkthrough.

## Where it stands

All nine steps under #35 are built on `AjsAgent/lucid-dirac-2t9c5y`, which continues `ccr-b76fb27e-nuy8j2`. Version 0.4.0 is set for the Windows app and the Android app. There are 199 tests: 196 pass, 0 fail and 3 are skipped on Linux. GitHub's Windows workflow (run 60) passed every step and built the installer. The Android workflow built the APK in run 14; run 15 hit a download error at Maven Central and was re-run. The QA page is `docs/plans/companion-qa.html`.

## The next step

QA of 0.4.0 failed. Fixed since then, each checked: untitled sessions (`site/js/discovery.js`), pictures in the chat, the Files panel layout, and Claude Code notices shown as typed by Aj (205 tests: 202 pass, 0 fail, 3 skipped). The cloud sessions design is published for Aj as a web page (source `docs/plans/cloud-sessions-list.json`). Wait for Aj's answers to its three questions, then build the cloud session reader. Wait for a screenshot of the broken Android screen before changing the Android layout.

## What is unverified

The cloud endpoint `GET /v1/code/sessions` with a real token (no signed-in account here), whether `claude auth status` renews an expired token, what is broken in the Android app, Aj's real signed-in accounts, a real Continue between two accounts, the APK on a real phone (camera, notifications, battery, background pause), and real Claude Code behind the phone link.

## Issues

#35 parent. #28, #29, #30, #31, #32, #34, #36, #37 and #38 are in needs review. #26 and #27 wait to be closed until Aj names them.
