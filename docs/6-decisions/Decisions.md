# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.




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
