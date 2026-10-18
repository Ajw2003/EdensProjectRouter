# Project state

**Headline: 60%.** Both designs and the build plan are approved, and the build is under way on `AjsAgent/project-thread-lle0v5`. Built: session discovery, the website's folder access, the limit reporter, the board, the walkthrough, the Electron app, and the Pages and installer workflows. 42 automated tests pass here (3 PowerShell ones skip without PowerShell); the app was driven end to end here (three fake accounts found, limit tracking turned on, a reporter reading shown, walkthrough clicked through). GitHub's Windows machine ran all 40 tests (the reporter in Windows PowerShell 5.1) and built `Project Router Setup 0.1.0.exe`. Aj's first install found 212 sessions but failed to read limit-tracking state (`SyntaxError: Unexpected token 'export'`), because Electron's Node loaded `site/js/reporter.js` as CommonJS; `site/package.json` now marks `site/` as ES modules, and a packaged build was checked here. "New session here" also failed on Aj's PC ("Unknown account null") and is fixed. Aj approved a redesign on 2026-10-18 (1A 2A 3A): a folding, searchable project list, and sessions opened inside the app with real Claude Code in a terminal panel. Build plan `docs/plans/router-redesign-build-plan.html` and issues #10 to #13 wait on Aj's approval. Waiting on: Aj's test on their PC (QA page `docs/plans/router-qa.html`) and GitHub Pages being turned on. A release could not be published from the agent's session because tag pushes did not reach GitHub, so the installer is a workflow download for now.

| Milestone | Status |
|---|---|
| 1 — Approved design | Done: approved 2026-10-18 |
| 2 — Working prototype on Windows | Built, in QA. Issue #1 (Router prototype: a GitHub Pages board of Claude Code sessions by project) with seven sub-issues covering the website and the Windows app; needs review |
| 3 — Daily use | Not started |

## The one thing that is not what it looks like

Everything was tested on Linux. On Windows, only the GitHub workflow runs the tests (including the reporter in Windows PowerShell 5.1) and builds the installer; opening Windows Terminal, `tasklist`, and the real Edge folder picker have not run anywhere yet.

## Cross-cutting issues

- Aj's machine details (Windows version, Edge or Chrome, how the three accounts' folders are named) are not recorded yet. The app found only one Claude folder on Aj's PC, so how the other two accounts are stored is an open question.
- The repository's default branch is `claude/project-thread-lle0v5` (there is no `main`); the pull request targets it and the website publishes from whichever branch is the default.
- GitHub Pages is not turned on yet.
