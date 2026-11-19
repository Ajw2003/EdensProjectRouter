# Handoff: companion build on ccr-b76fb27e-nuy8j2

## What the work is for

The desktop and phone companion for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on both the PC and the phone, every account usable without switching, and a phone link that needs no Remote Control.

## Where it stands

Steps 1 to 6 are merged on `ccr-b76fb27e-nuy8j2`: 193 tests, 190 pass, 0 fail and 3 skipped. Step 5's app check saw 19 of 19 items. Step 7 (the phone link) and step 8 (the Android app) are each being built by a helper in their own worktrees. aj chose qrcode-generator for the PC's QR code and jsQR for the phone's scanner.

## The next step

Check and merge steps 7 and 8, push, and confirm the Android workflow is green on GitHub. Then build step 9: the Help page, the QA page and version 0.4.0.

## What is unverified

Windows, the real signed-in accounts, the real copy-and-resume between two accounts, and the Android app: all of these wait for aj's PC and phone. One test in `tests/keys.test.js` (permission keys reaching the stand-in) failed once under load and passes alone.

## Issues

#35 parent; #36, #28, #29, #30 and #32 built; #31 built; #37 and #38 building; #34 still to do; #26 and #27 waiting to be closed.
