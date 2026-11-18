# Project state

**Headline: 0%.** Two plan pages wait for Aj's approval: the first design, `docs/plans/router-prototype.html`, and the desktop-and-phone plan, `docs/plans/companion-app.html`, which grows it. No code exists.

| Milestone | Status |
|---|---|
| 1 — Approved design | Page written, waiting on Aj |
| 2 — Working prototype on Windows | Not started |
| 3 — Account handoff | Proposed |
| 4 — Phone on home Wi-Fi | Proposed |
| 5 — Phone away from home | Proposed |
| 6 — Daily use | Not started |

## The one thing that is not what it looks like

Everything was tested on Linux. On Windows, only the GitHub workflow runs the tests (including the reporter in Windows PowerShell 5.1) and builds the installer; opening Windows Terminal, `tasklist`, and the real Edge folder picker have not run anywhere yet.

## Cross-cutting issues

- Aj's machine details (Windows version, Edge or Chrome, how the three accounts' folders are named) are not recorded yet. The app found only one Claude folder on Aj's PC, so how the other two accounts are stored is an open question.
- The repository's default branch is `claude/project-thread-lle0v5` (there is no `main`); the pull request targets it and the website publishes from whichever branch is the default.
- GitHub Pages is not turned on yet.
