# Decisions

Newest entry at the top. Entries are never rewritten; a replaced one has its Status flipped to Superseded with a pointer.

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
