# Handoff: companion build on ccr-b76fb27e-nuy8j2

## What the work is for

The desktop and phone companion for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on both the PC and the phone, every account usable without switching, and a phone link that needs no Remote Control.

## Where it stands

2026-11-19: the work moved to `AjsAgent/lucid-dirac-2t9c5y`. Steps 1 to 9 are built. The step 9 helper left no branch, so step 9 was rebuilt there: the Help page (`site/js/help.js`), the walkthrough removed, and version 0.4.0. The Windows workflow passes for the first time on the companion code, after a fix to `tests/phonelink.test.js`. There are 199 tests: 196 pass, 0 fail and 3 are skipped. The QA page is `docs/plans/companion-qa.html`.

## The next step

Aj tests from the QA page. Fix what fails, then open a pull request when Aj asks for one.

## What is unverified

Aj's real signed-in accounts, the real copy-and-resume between two accounts, the APK on a real phone (camera, notifications, battery, background pause), and real Claude Code for the phone link.

## Issues

#35 parent; #28 to #32, #34 and #36 to #38 are in needs review; #26 and #27 wait to be closed until Aj names them.
