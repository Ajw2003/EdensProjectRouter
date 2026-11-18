# Router hub and companion (planned, not built)

Approved design: `docs/plans/companion-app.html` (decision of 2026-11-18 in `docs/6-decisions/Decisions.md`).

## What it owns

The Windows app `EdensRouter.exe` (Electron) and the Android app `EdensRouter.apk` (Capacitor, same screens). The PC app runs every Claude session; the phone is a window onto it.

## Parts

| Part | Job |
|---|---|
| Session finder | Reads every account folder and groups sessions by project. See [session-discovery](session-discovery.md). |
| Account slots | `%USERPROFILE%\.claude` is slot one; `.claude-account2` upward are the rest. Four to start, no upper limit. |
| Terminal host | Runs the real `claude` command per session in a hidden terminal (node-pty), shown with xterm.js. Keeps sessions running when a tab closes. |
| Visual view | Tails the session transcript (`.jsonl`) and draws bubbles, action cards with a Why line, question cards, inline pages and pictures, and the Now strip. Taps and messages are written into the terminal as keystrokes. |
| Account router | Starts each project on its last account by setting `CLAUDE_CONFIG_DIR`. On Claude's usage-limit message it offers one tap to copy the transcript into another account folder and `claude --resume` it there. |
| Phone link | A server on the PC that accepts only paired phones. Pairing is a one-time QR code (five minutes, single use) that swaps a device key. Reached over Tailscale away from home. |
| ADHD and autism layer | Needs-you list with phone notifications, focus card, Now strip, Why line, calm scrolling, Where-you-were card, Pages shelf. |

## Invariants

- The router never writes into an account folder except to copy a transcript when Aj taps to hand off.
- Sign-ins are never copied between accounts.
- The phone link refuses any request without a paired device key.

## Traps

- Tap-to-keystroke depends on Claude's terminal layout for questions; it can change between Claude versions. Fallback: drive Claude through its stream-json protocol instead.
- The transcript records tool calls while the session runs (checked on 2026-11-18 on a live session: 89 assistant records, 59 tool calls).
