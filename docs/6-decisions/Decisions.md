# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.

## 2026-11-19 — The first-run walkthrough is replaced by a Help page

**Context.** Step 9 of the approved companion build plan (issue #34) says to add a Help page with one picture per task and to remove the first-run walkthrough. The calm-redesign spec that #34 points to was never committed, so the issue text is the whole spec.

**Decision.** `site/js/walkthrough.js` is deleted. Its three steps went to existing places: adding folders to the Add Claude folder button and the More menu, limit tracking to the Turn on limit tracking buttons, and "how to read the board" to Help cards. Nothing opens on first launch any more; Help opens only from its button.

**Why.** A screen that opens by itself is the kind of interruption the calm design avoids, and every job the walkthrough did already had a permanent home.

**Status.** Standing. Replaces the walkthrough described in `docs/4-systems/board.md`.




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

## 2026-10-19 — Design opened: cloud sessions in the router

**Context.** While testing 0.3.0, Aj asked that "local sessions on the downloaded app need to be able to see and connect to cloud sessions like this one". Claude Code 2.1.302 offers `--cloud <id>` (queues one message into a cloud session and exits), `--teleport [session]` (copies a cloud session's conversation and branch to the PC) and `--remote-control [name]` (shows a local session on claude.ai/code and in the Claude app). Its docs (code.claude.com, CLI reference, "Claude Code on the web" and "Remote Control" pages) describe no supported way to list cloud sessions outside claude.ai/code and the interactive `--teleport` picker.

**Decision.** Nothing is built yet. The design page `docs/plans/router-cloud-sessions.html` proposes a Cloud tile per account showing the real claude.ai/code page, a Continue on this PC button (teleport), a Show on claude.ai switch per local tile (Remote Control) and cloud sessions as Send to targets, with options for Aj to pick.

**Why.** Only supported Claude Code features are used, so nothing depends on claude.ai's private workings.

**Status.** Standing.

## 2026-10-18 — Build plan approved: router grid (1? 2A)

**Context.** The build plan `docs/plans/router-grid-build-plan.html` splits the session grid, visuals and hand-off into issues #15 to #22 under issue #14, and asked when Aj wants an installer and whether three libraries may be added.

**Decision.** Aj approved it with "Build plan approved: router grid 1? 2A". 2A: dockview-core, marked and @modelcontextprotocol/sdk are added (all MIT). For question 1 Aj left the answer open, so the suggested option A applies until Aj says otherwise: an installer after step 4 (issues #15 to #18), then another after step 8. Build contract: `docs/plans/router-grid-spec.md`.

**Status.** Standing.

## 2026-10-18 — Design approved: router visuals and handoff (1A 2A 3C 4* 5*)

**Context.** Aj approved `docs/plans/router-visuals-handoff.html` with "Design approved: router visuals and handoff 1A 2A 3C 4* 5*", and resent the session grid approval in the next message. Aj also asked that house-rules pages and any generated artifact work inside the router.

**Decision.**
- 1A: each project gets a Visuals tile. Files its sessions write are found automatically, and a one-click Show tool lets Claude put a file on screen on purpose.
- 2A: next to a page's copyable reply, the router adds a Send button. Send types the reply into the session the page came from and waits for Aj to press Enter.
- 3C: a conversation is sent either as a cleaned copy (the default, free) or as a summary written by a one-off copy of the session, chosen each time.
- 4, Aj's own answer: both Send to and Ask are built. Ask always works without usage, by sending the other session's cleaned conversation with the question. When the other session's account has room, Ask also offers a read-only copy of that session to answer, labelled with the usage it spends, and Aj decides each time.
- 5, Aj's own answer: hand-off files go in `.router-handoff` inside the receiving project and are **not** kept out of git by default, because Aj backs projects up with git. A per-project toggle adds or removes the folder in the repository's local exclude file (`.git/info/exclude`).

One build plan covers the session grid and these features together.

**Why.** These were Aj's picks and own answers on the page. The free fallback for Ask means hand-off never stops working when an account is out of usage.

**Status.** Standing.

## 2026-10-18 — Design approved: router session grid (1A 2A 3A 4A 5A), with new asks opened as a second design

**Context.** Aj approved `docs/plans/router-session-grid.html` with "Design approved: router session grid 1A 2A 3A 4A 5A". In the same message Aj asked for three more things: a layout with only projects visible, or one monitor of projects and one of terminals; a way to see visuals for each project that a bare terminal can't show (as https://github.com/iamumeransari/claude-show-your-work and Claude Desktop do); and an easy way to pass files, artifacts, transcripts and one session's context into new sessions or sub-sessions without one session working on several projects.

**Decision.** The open session becomes a grid of movable, resizable tiles built on dockview-core (MIT):
- 1A: one full grid window per monitor, with tiles dragged between windows.
- 2A: the list is a tile, and any project can be dragged out as its own tile.
- 3A: each account gets its own Claude folder, every tile shows its account and can switch it.
- 4A: a project shows its pinned sessions first, then the newest, up to a per-project number (default 2), with "Show all".
- 5A: on reopening, tiles come back in place showing their preview and Resume button, and nothing runs until Aj presses Resume.

The projects-only and projects-on-one-monitor layouts fall inside 1A and 2A: a window may hold only project tiles, so the grid build includes a "Projects only" quick layout. Visuals, hand-off and shared context are new features, so they go on their own design page, `docs/plans/router-visuals-handoff.html`, before any build.

**Why.** The grid choices were Aj's picks on the page. The three new asks change what the app shows and stores, so they are designed and approved before they are planned.

**Status.** Standing.

## 2026-10-18 — Build plan approved: router redesign (1A 2A)

**Context.** The build plan `docs/plans/router-redesign-build-plan.html` splits the redesign into issues #10 to #13 and asked two questions about sessions running in the app's terminal panel.

**Decision.** Aj approved it with "Build plan approved: router redesign 1A 2A". 1A: when you open another session, the Claude Code in the panel you leave keeps running in the background. 2A: closing the app while a panel's Claude Code is still running asks first and names those sessions. Build contract: `docs/plans/router-redesign-spec.md`.

**Status.** Active.

## 2026-10-18 — Design approved: router redesign (1A 2A 3A)

**Context.** Aj found the board of columns hard to read and not useful, and asked for projects and sessions that fold and can be searched, and for opening a session to watch and work in it. Design page: `docs/plans/router-redesign.html`.

**Decision.** Aj approved it with "Design approved: router redesign 1A 2A 3A". 1A: real Claude Code runs in a terminal panel inside the app (node-pty and xterm.js), with a readable conversation view beside it. 2A: the list sits on the left and the open session on the right. 3A: session rows show title, time and context only; limits show once at the top and in the open session's header. The Claude desktop app was ruled out because nothing outside it can open it at a chosen session, and a chat screen on the Agent SDK was ruled out because offering subscription login through a third-party app needs Anthropic's approval. This supersedes the board layout in `docs/plans/router-build-spec.md`.

**Status.** Active.

## 2026-10-18 — Fix: "New session here" passed no account

**Context.** Aj's installed app showed "Could not start a session: Error: Error invoking remote method 'router:newSession': Error: Unknown account null". The board called `source.newSession(cwd, null)` and never chose an account (`site/js/main.js`).

**Decision.** `limits.accountForNewSession` picks the account with the most room that the router can read, and the button passes its id. Checked by a unit test and by clicking the button in the running app, which launched `claude` in the session's folder on the default account.

**Status.** Active.

## 2026-10-18 — Fix: the installed app failed to load the shared reporter module

**Context.** Aj's first install showed "Problem reading .claude: Error invoking remote method 'router:reporterState': SyntaxError: Unexpected token 'export'" and no sessions, after finding 212.

**Decision.** Added `site/package.json` with `"type": "module"`, and made a limit-tracking error show as a notice without hiding the account's sessions.

**Why.** Reproduced with Electron's own Node 20.18.3 (`ELECTRON_RUN_AS_NODE=1`): it treats `resources/site/js/reporter.js` as CommonJS. Node 22, used by the tests, guesses ES modules, which is why nothing caught it before. A locally packaged app with the fix loaded sessions and turned on limit tracking with no notice.

**Status.** Standing.

## 2026-10-18 — Windows app design approved: Electron, most-room account, both together

**Context.** Aj approved `docs/plans/router-windows-app.html` with "Design approved: router windows app 1A 2A 3A".

**Decision.** The app is built with Electron and reuses the website's board code. A new session starts on the account with the most 5-hour room, picked for Aj and changeable. The website and the app are built together in one pull request.

**Why.** Electron runs the website's code as it is and can be tested in the agent's sandbox and on GitHub's Windows runners; the most-room pick is the "route work across accounts" part of the project's goal; building together costs little more because the board is shared.

**Status.** Standing.

## 2026-10-18 — A Windows app is added beside the website (design open)

**Context.** After the build plan page `docs/plans/router-build-plan.html` went out, Aj asked for an installable version as well, one that can orchestrate local sessions, auto-detect accounts and make setup easier.

**Decision.** The build plan page is set aside, not approved. A new design page, `docs/plans/router-windows-app.html`, proposes a Windows app that shares the website's board and adds automatic account discovery, automatic limit tracking, starting and resuming sessions, and showing which sessions are running. The website stays.

**Why.** A website cannot find folders, run programs or see running processes, so these needs require something installed. Aj's choices on the new page decide the app's technology, how a new session's account is picked, and build order.

**Status.** Standing.

## 2026-10-18 — Design approved: a GitHub Pages site, grouped by project only, with limits on every session

**Context.** Aj approved the design page `docs/plans/router-prototype.html` with "Design approved: router prototype 1* 2A 3C". For choice 1 (what to build it with) Aj gave their own answer: a site hosted from Git like their other projects, so nothing is hosted by them and nothing is downloaded. Aj also said not to rename the accounts and not to make the app an account switcher: sessions are split by project only, and each session shows its 5-hour session limit, its account's weekly limit, and its context use.

**Decision.** The prototype is a static site served by GitHub Pages from this repository. It reads Claude Code's folders on Aj's PC through the browser's folder-access feature (Edge and Chrome only). The board layout (choice 2A) stands. Accounts keep their own folder names and are found when Aj picks the folders (choice 3C). The Main/Work/Spare slots, the start-a-session button and the account picker from the first page are dropped. Limits come from Claude Code's status line feed, which only Claude Code itself can see, so a small reporter is added to each account's status line with one click.

**Why.** A local web app (the suggested option A) needed Node.js and a download. A web page cannot run programs or read files on its own, so the browser's folder access is the only way a hosted page can see local sessions. The 5-hour and weekly limit percentages are not written to any file by Claude Code; the only official source is the JSON it hands to a status line command (`rate_limits.five_hour` and `rate_limits.seven_day`), so a reporter that saves that JSON is the smallest way to get them.

**Status.** Standing.

## 2026-10-18 — Design stage opened for the first prototype

**Context.** Aj asked for a functional prototype that runs on a Windows PC and works with their three Claude accounts by default. The repository was empty.

**Decision.** The docs tiers were scaffolded and a design page was written at `docs/plans/router-prototype.html` for Aj to approve before any code is written. Nothing about the stack or layout is decided yet; the page carries the options.

**Why.** House rule: ideas come before code, and every plan reaches Aj as a page to approve.

**Status.** Standing.
