# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.




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
