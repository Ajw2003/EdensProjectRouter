# Project state

**Headline: 60%.** Both designs and the build plan are approved, and the build is under way on `AjsAgent/project-thread-lle0v5`. Built: session discovery, the website's folder access, the limit reporter, the board, the walkthrough, the Electron app, and the Pages and installer workflows. 40 automated tests pass here; the app was driven end to end here (three fake accounts found, limit tracking turned on, a reporter reading shown, walkthrough clicked through). Waiting on: the Windows workflow's first run, GitHub Pages being turned on, and Aj's own test on their PC.

| Milestone | Status |
|---|---|
| 1 — Approved design | Done: approved 2026-10-18 |
| 2 — Working prototype on Windows | Built, in QA. Issue #1 (Router prototype: a GitHub Pages board of Claude Code sessions by project) with seven sub-issues covering the website and the Windows app; needs review |
| 3 — Daily use | Not started |

## The one thing that is not what it looks like

Everything was tested on Linux. On Windows, only the GitHub workflow runs the tests (including the reporter in Windows PowerShell 5.1) and builds the installer; opening Windows Terminal, `tasklist`, and the real Edge folder picker have not run anywhere yet.

## Cross-cutting issues

- Aj's machine details (Windows version, Edge or Chrome, how the three accounts' folders are named) are not recorded yet.
- `main` was created from the first commit so the pull request has a base.
- GitHub Pages is not turned on yet.
