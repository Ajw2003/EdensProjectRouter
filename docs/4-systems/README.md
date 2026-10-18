# Systems

One document per runtime-critical system. All five are built on `AjsAgent/project-thread-lle0v5`; none has run on Windows yet except through the Windows test workflow.

| System | Owns | Status |
|---|---|---|
| [Folder access](folder-access.md) | Getting and keeping the browser's permission to read each Claude account folder | Built |
| [Session discovery](session-discovery.md) | Reading sessions from each folder, grouping them by project, working out context use | Built |
| [Limit reporter](limit-reporter.md) | Getting the 5-hour and weekly limit numbers out of Claude Code and onto disk | Built |
| [Windows app](windows-app.md) | Finding accounts, starting and resuming sessions, spotting running ones, picking the account with most room | Built |
| [Board](board.md) | Showing projects, sessions and their three bars, plus the first-run walkthrough | Built |

Considered and left out: account switching as the main way to use the board (Aj ruled it out on 2026-10-18; accounts only matter when starting a new session), and any server (the website is static on GitHub Pages).
