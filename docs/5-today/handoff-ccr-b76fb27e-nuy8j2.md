# Handoff: companion build on ccr-b76fb27e-nuy8j2

## What the work is for

The desktop and phone companion for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on both the PC and the phone, every account usable without switching, and a phone link that needs no Remote Control.

## Where it stands

Steps 1 to 8 are merged on `ccr-b76fb27e-nuy8j2`. The suite has 201 tests: 198 pass, 0 fail and 3 are skipped. The step 7 phone drive passed 13 of 13 checks, and the Android workflow built `EdensRouter.apk`. Step 9 (the Help page, the walkthrough removal and the 0.4.0 version number) is being built by a helper. The Windows workflow was started on this branch to run the tests on real Windows.

## The next step

Read the Windows workflow result. Check and merge step 9. Write the QA page with `make_page.py` in QA mode, then move every issue under #35 to `needs review`.

## What is unverified

Windows itself (waiting on the workflow), aj's real signed-in accounts, the real copy-and-resume between two accounts, the APK on a real phone (camera, notifications, battery, background pause), and real Claude Code for the phone link.

## Issues

#35 parent; #36, #28, #29, #30, #31, #32, #37 and #38 built; #34 building; #26 and #27 waiting to be closed.
