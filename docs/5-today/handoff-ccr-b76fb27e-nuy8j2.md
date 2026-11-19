# Handoff: companion build on ccr-b76fb27e-nuy8j2

## What the work is for

The desktop and phone companion for Project Router, built on the 0.3.0 app: a Terminal view and a Visual view on both the PC and the phone, every account usable without switching, and a phone link that needs no Remote Control.

## Where it stands

Steps 1 to 4 and step 6 are merged on `ccr-b76fb27e-nuy8j2`. Step 5 (the ADHD and autism layer) is built on `worktree-agent-a193a2a8a751bbc35`, waiting for its app check to finish before it is merged.

## The next step

Merge step 5, run `npm test` on the merged branch, then build step 7, the phone link.

## What is unverified

Windows, the real signed-in accounts, the real copy-and-resume between two accounts, and the Android app: all of these wait for aj's PC and phone. One test in `tests/keys.test.js` (permission keys reaching the stand-in) failed once under load and passes alone.

## Issues

#35 parent; #36, #28, #29, #30 and #32 built; #31 in check; #37, #38 and #34 still to do; #26 and #27 waiting to be closed.
