# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.

## 2026-11-18 — Any number of accounts, four to start

**Context.** Aj corrected the account count: they have four accounts, not three, and the app should work with however many they want.

**Decision.** The companion plan, `docs/plans/companion-app.html`, now starts with four slots (Main, Work, Spare and Extra, using `.claude` and `.claude-account2` to `.claude-account4`) and an Add account button with no upper limit. This replaces the first design's three fixed slots.

**Why.** Aj's own correction.

**Status.** Standing, waiting for approval with the rest of the plan.

## 2026-11-18 — Desktop and phone companion plan proposed

**Context.** Aj asked for the router as a Windows .exe plus an Android APK companion that can use the PC's sessions remotely, without Claude's own Remote Control, and work on any project across any account without switching accounts.

**Decision.** A plan page was written at `docs/plans/companion-app.html`. It keeps the first design's finder, board, account slots and walkthrough, makes the app an .exe, runs sessions inside the app so a paired phone can attach, and adds an account router. Four choices are open on the page: the remote link, the phone's session view, account picking and the stack.

**Why.** House rule: ideas come before code, and every plan reaches Aj as a page to approve.

**Status.** Standing, waiting for approval.

## 2026-10-18 — Design stage opened for the first prototype

**Context.** Aj asked for a functional prototype that runs on a Windows PC and works with their three Claude accounts by default. The repository was empty.

**Decision.** The docs tiers were scaffolded and a design page was written at `docs/plans/router-prototype.html` for Aj to approve before any code is written. Nothing about the stack or layout is decided yet; the page carries the options.

**Why.** House rule: ideas come before code, and every plan reaches Aj as a page to approve.

**Status.** Standing.
