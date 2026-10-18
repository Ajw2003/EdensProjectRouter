# Project Router

One board for every Claude Code session across all your accounts, grouped by project. Each session shows how full its context is, its account's 5-hour limit and its account's weekly limit, with when each resets.

It comes two ways from the same code:

- **Website** (nothing to install): open the GitHub Pages link in Edge or Chrome and pick your Claude folders (`C:\Users\<you>\.claude`, and any `.claude-something` folders beside it).
- **Windows app**: install it from the latest GitHub Release. It finds your Claude folders itself, resumes sessions in Windows Terminal, starts new ones on the account with the most room, and marks active sessions. The installer is not code-signed, so Windows shows "Windows protected your PC" the first time: click **More info**, then **Run anyway**.

Try the board with made-up data: open the site with `?demo=1` on the end of the address.

## Limit tracking

Claude Code only shows the 5-hour and weekly limits to its status line. **Turn on limit tracking** (per account) backs up that account's `settings.json` to `settings.json.router-backup` and adds a small PowerShell reporter as the status line. Any status line you already had keeps working. Turning it off restores the old one.

## For developers

- Tests: `npm test` (set `PWSH` to a PowerShell path to run the reporter tests).
- App: `npm --prefix desktop install` then `npm --prefix desktop start`.
- Docs: [docs/1-landing/README.md](docs/1-landing/README.md).
