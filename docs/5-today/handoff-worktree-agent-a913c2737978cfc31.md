# Handoff: phone link (step 7) on worktree-agent-a913c2737978cfc31

## What the work is for

The phone link lets a paired phone use the PC's Claude sessions: a server in the PC app, QR pairing, and the same screens on the phone.

## Where it stands

It is built and has unit tests. The first drive run failed because a phone tap read the phone's own narrow copy of the terminal screen. Now a tap reads the screen in the PC app at the terminal's real size (`ptyScreen`), and the phone can no longer resize the PC's terminal. `@xterm/headless` is now a runtime package, so the installed app has it. The race in `tests/keys.test.js` is fixed, and that test passed 8 times in a row. A tap now joins the session first. The drive logs the phone's notice and errors after the tap, and it no longer presses Esc on the PC. The last drive passed 12 of 13 checks, and unpairing works. The one failure is that a phone tap did not move the PC terminal. A fourth run is going.

## The next step

Read the drive result. If it passes, merge into `ccr-b76fb27e-nuy8j2`, match `NEEDS_YOU_EVENT` in `android-app/www/remote.js` to the phone link's notify event name, and push.

## What is unverified

The drive after the fix, unpairing from the PC, a real phone, and Windows.

## Issues

#37 (phone link), part of #35.
