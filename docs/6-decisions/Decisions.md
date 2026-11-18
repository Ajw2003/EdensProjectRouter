# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.

## 2026-11-18 — The companion plan missed the 0.3.0 app

**Context.** While making the build-plan issues after the companion approval, the GitHub issue list showed the Project Router 0.3.0 Windows app on the branch `AjsAgent/project-thread-lle0v5` (90 commits, issues #4 to #34). This session had read only the default branch `claude/project-thread-lle0v5`, which holds the first three documents, so the companion plan treated the project as unbuilt.

**Decision.** No build-plan issues were made. A correction page, `docs/plans/companion-rebase.html`, maps the plan onto 0.3.0 and asks where to build, what happens to the calm redesign issues (#26 to #34), and when Aj tests 0.3.0.

**Why.** House rule: check what exists before building. The calm redesign's message-mode chat engine (#27) clashes with Aj's answer that the Visual view is drawn from the transcript beside the real terminal.

**Status.** Standing, waiting for Aj's answers.

## 2026-11-18 — Companion design approved

**Context.** Aj sent "Design approved: desktop and phone companion 1A 2A 3A 4A 5B" for `docs/plans/companion-app.html`.

**Decision.** The Visual view is drawn from the transcript beside the real terminal, and taps are typed in as keys (question 1, how the Visual view talks to Claude: A). The phone reaches the PC through Tailscale (question 2, the remote link: A). Accounts are picked automatically, with one-tap handoff (question 3, which account a session uses: A). The apps are built with Electron and Capacitor (question 4, the stack: A). All seven ADHD and autism features come in the first build (question 5, which features first: B, all seven at once).

**Why.** Aj's choices on the approved page.

**Status.** Standing. Supersedes the open stack, layout and accounts questions on `docs/plans/router-prototype.html`.

## 2026-11-18 — Both views on both devices, built around ADHD and autism

**Context.** Aj asked for both the phone and the PC to have the terminal view and a view that mirrors the Claude app, including artifacts, question bubbles and other visuals, tailored to their ADHD and autism.

**Decision.** The companion plan, `docs/plans/companion-app.html`, now gives every session a Terminal view and a Visual view on both devices, kept in step by drawing the Visual view from the session transcript and typing taps into the terminal as keys. It adds seven features (Needs-you list, focus card, Now strip, Why line, calm scrolling, Where-you-were card, Pages shelf) and a Visual view milestone. The earlier either-or choice between a terminal and a chat view on the phone is removed.

**Why.** Aj's own request. That the transcript records tool calls live was checked on this session's own transcript (89 Claude messages, 59 tool calls, while running).

**Status.** Standing, waiting for approval with the rest of the plan.

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
