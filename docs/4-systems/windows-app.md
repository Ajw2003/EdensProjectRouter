# Windows app (planned, not built)

## What it owns

The installable Electron app: finding account folders by itself, installing the limit reporter by itself, starting and resuming sessions in a terminal, spotting which sessions are running, and picking the account with the most room for a new session.

## How it works (planned)

The app loads the same board files as the website (`site/`). Where the website asks the browser for folder access, the app's main process reads the disk directly and hands the board the same data shape, so the board code does not know which version it is in.

- **Finding accounts:** every folder in the user folder named `.claude` or starting with `.claude-` that contains a `projects` folder. A folder named in the `CLAUDE_CONFIG_DIR` environment variable is added too.
- **Resume:** opens Windows Terminal (`wt.exe`), falling back to `cmd.exe`, in the session's `cwd`, with `CLAUDE_CONFIG_DIR` set to the session's account folder (left unset for the default `.claude`), running `claude --resume <session id>`.
- **New session:** same, running `claude`, on the account picked in the new-session window. The account with the lowest 5-hour use is picked first, with weekly use breaking a tie; accounts with no limit reading come last.
- **Running sessions:** a session counts as running when its transcript changed in the last 2 minutes and a `claude` process exists. This is a guess, not a certain link between process and session, and the board says "active" rather than claiming certainty.
- **Releases:** GitHub Actions builds an NSIS installer on a Windows runner for each tag and attaches it to a GitHub Release.

## Invariants

- The app never writes to an account folder except when installing or removing the limit reporter, and it backs up `settings.json` first.
- It never stores or reads sign-in tokens.

## Traps

- The installer is unsigned, so Windows SmartScreen warns on first run.
