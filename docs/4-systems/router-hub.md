# Router hub and companion (planned, not built)

Approved design: `docs/plans/companion-app.html` (decision of 2026-11-18 in `docs/6-decisions/Decisions.md`).

## What it owns

The companion grows the existing Project Router app (Electron, `desktop/` and `site/`) and adds an Android app (Capacitor, same screens). The PC app runs every Claude session; the phone is a window onto it. Build plan: issue #35 (Desktop and phone companion, built on the 0.3.0 app) and its nine steps.

## Parts

| Part | Job |
|---|---|
| Session finder | Built: `site/js/discovery.js`. See [session-discovery](session-discovery.md). |
| Account slots | Built: `desktop/accounts.js` finds every `.claude` folder and adds accounts. Duplicate refusal is step 6 (#32). |
| Terminal host | Built: `desktop/pty.js` (node-pty) and `site/js/terminal.js` (xterm.js). |
| Visual view | New engine in step 1 (#36), on top of `site/js/transcript.js`. Tails the session transcript (`.jsonl`) and draws bubbles, action cards with a Why line, question cards, inline pages and pictures, and the Now strip. Taps and messages are written into the terminal as keystrokes. |
| Account router | Step 6 (#32). Starts each session on its last account. When `site/js/limits.js` says that account is full, one tap copies the transcript with `desktop/transfer.js` and resumes it on the account with room. |
| Phone link | Step 7 (#37). A server on the PC that accepts only paired phones. Pairing is a one-time QR code (five minutes, single use) that swaps a device key. Reached over Tailscale away from home. |
| Visual view screen | Built (#29): `site/js/visual.js` draws the chat, action cards with a Why line, question, permission and answered cards; `site/js/visualcards.js` (pure, tested in `tests/visualcards.test.js`) maps events to cards and taps to keys. Permission cards come from the drawn screen through the `screenRead` IPC, because permission prompts are not in the transcript. |
| Visuals in the chat | Built (#30): picture, page and Markdown cards in the chat open in a side panel (`site/js/visualside.js`); pages keep Send my choices; claude.ai links get an Open in browser card; the Files panel shows each change before and after; the Pages shelf lists every visual in a project (`site/js/visualpanels.js`, `site/js/shelf.js`, tests in `tests/visualpanels.test.js`). |
| ADHD and autism layer | Needs-you list with phone notifications, focus card, Now strip, Why line, calm scrolling, Where-you-were card, Pages shelf. |

## Invariants

- The router never writes into an account folder except to copy a transcript when Aj taps to hand off.
- Sign-ins are never copied between accounts.
- The phone link refuses any request without a paired device key.

## Traps

- `CLAUDE_CODE_CHILD_SESSION` in the environment turns Claude Code's transcript saving off, which would leave the Visual view blank. It is inherited when the app starts from inside a Claude session, so `buildEnv` in `desktop/launch.js` removes it (found by the real-Claude check, 2026-11-18).
- Claude Code's folder-trust list highlights "No, exit": answer setup lists by name, never with a blind Enter.

- Claude Code's terminal positions text with cursor moves, not spaces, so stripping escape codes from raw pty output loses the gaps ("Let'sgetstarted"). Found 2026-11-18 by `desktop/scripts/check-visual-keys.cjs` on real Claude Code 2.1.327: the first-run theme list was never recognised. The screen must be read from a terminal emulator's drawn buffer (the app's xterm.js Terminal), not from raw output.

- Tap-to-keystroke depends on Claude's terminal layout for questions; it can change between Claude versions. Fallback: drive Claude through its stream-json protocol instead.
- The transcript records tool calls while the session runs (checked on 2026-11-18 on a live session: 89 assistant records, 59 tool calls).

## Accounts: automatic account, handoff when full, no duplicates (issue #32)

- A session opens on the account it last used: the pane's `accountId` goes to `buildPtyCommand` (`desktop/launch.js`), which sets `CLAUDE_CONFIG_DIR` for it (`tests/accountsflow.test.js`).
- New session (`site/js/newsession.js`) is a box with a project picker and the accounts, most room first; the first is marked "Suggested" (`accountChoices` in `site/js/accounts.js`, ordering from `orderByRoom` in `site/js/limits.js`). Pick another before Start.
- When an account's five-hour or weekly window is at 100 percent (`isFull`, the newest reading from `accountLimits`), `continueTarget` names the other account with room and `site/js/continuebutton.js` shows one orange "Continue on <account>" button in the pane header and at the top of the Visual view. The tap calls the tile's `continueOn`, which is the old copy-and-switch (`copySessionTo` then resume) without the question.
- Any number of accounts works. "Add account" lives under More and refuses a folder already added (`duplicateAccount`, by folder name). A sign-in that ends on an email already added is reported; the folder is left for you to remove (the app never deletes). Covers issue #25.
- Trap: building the packaged Linux app here needs `node-pty` rebuilt with `npm rebuild node-pty` (it is N-API, so system Node is fine); `electron-rebuild` fails because the proxy blocks the Electron headers download (403).
