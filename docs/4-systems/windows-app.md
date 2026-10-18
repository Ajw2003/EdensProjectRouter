# Windows app

## What it owns

The installable Electron app: finding account folders by itself, installing the limit reporter by itself, starting and resuming sessions in a terminal, spotting which sessions are running, and picking the account with the most room for a new session.

## How it works

Code: `desktop/` and `site/js/sources/desktop.js`.


The app loads the same board files as the website (`site/`). Where the website asks the browser for folder access, the app's main process reads the disk directly and hands the board the same data shape, so the board code does not know which version it is in.

- **Finding accounts:** every folder in the user folder named `.claude` or starting with `.claude-` that contains a `projects` folder. A folder named in the `CLAUDE_CONFIG_DIR` environment variable is added too.
- **Resume:** opens Windows Terminal (`wt.exe`), falling back to `cmd.exe`, in the session's `cwd`, with `CLAUDE_CONFIG_DIR` set to the session's account folder (left unset for the default `.claude`), running `claude --resume <session id>`.
- **New session:** same, running `claude`, on the account picked in the new-session window. The account with the lowest 5-hour use is picked first, with weekly use breaking a tie; accounts with no limit reading come last.
- **Running sessions:** a session counts as running when its transcript changed in the last 2 minutes and a `claude` process exists. This is a guess, not a certain link between process and session, and the board says "active" rather than claiming certainty.
- **Releases:** GitHub Actions builds an NSIS installer on a Windows runner for each tag and attaches it to a GitHub Release.

## Accounts IPC

Code: `desktop/accounts.js` (`readEmail`, `validateAccountName`), `desktop/transfer.js` (`copySession`), `desktop/launch.js` (`buildLoginCommand`), the "accounts block" and `registerAccountIpc` in `desktop/main.js`. Issue #17.

- `listAccounts()` now returns `{id, name, needsPermission, email}`. `email` is `oauthAccount.emailAddress` from `<account dir>/.claude.json`, and for the default `.claude` folder also from `<home>/.claude.json` (folder first); `null` when missing, and an unreadable or bad-JSON file is logged once to the main process's stderr.
- `copySessionTo(sessionId, fromAccountId, project, toAccountId)` copies `projects/<project>/<id>.jsonl` and the sibling `<id>/` folder (if any) into the other account's folder; never overwrites a file that is newer or equal there, never deletes the original; returns `{copied, skipped}` or throws (same account, bad id, transcript missing).
- `createAccount(name)` validates the name (1 to 32 letters, digits or dashes), makes `<home>/.claude-<name>` and refuses if it exists; returns `{id, name, home}`. Main remembers the folder as "signing in" so the next `ptyOpen` for that account id runs `claude auth login` (with `CLAUDE_CONFIG_DIR` set) instead of `claude`; the mark clears once a scan finds the folder.
- Discovery also accepts a `.claude-*` folder that has a `.claude.json` but no `projects` (a fresh sign-in). `listSessionFiles` returns `[]` for a folder with no `projects`.

## Terminal panel (pty) IPC

Code: `desktop/pty.js`, `desktop/launch.js` (`buildPtyCommand`), `desktop/main.js`, `desktop/preload.js`. Issue #13.

- **Calls** (on `window.routerDesktop`): `readTranscript(accountId, project, file, fromByte)` returns `{text, size}` (from `fromByte` to the end; from 0 on a file over 5 MB, only the last 5 MB, starting at a whole line; names are checked to stay inside the account's `projects` folder). `ptyOpen({sessionId, cwd, accountId, cols, rows})` returns `{ptyId}` or `{error}` (`notFound: true` when Claude Code is not on the PATH). `ptyWrite(ptyId, data)`, `ptyResize(ptyId, cols, rows)`, `ptyClose(ptyId)`, `ptyList()` returns `[{ptyId, sessionId, cwd, title}]`.
- **Events:** `onPtyData(cb)` gets `{ptyId, data}`, `onPtyExit(cb)` gets `{ptyId, exitCode}`; each returns a function that unsubscribes. Context isolation stays on; the callback never sees the raw IPC event.
- **Starting:** `claude` is found with `where` (Windows, preferring `claude.exe`, then `claude.cmd`) or `which`, once per run. A `.cmd` is run as `cmd.exe /d /s /c <path> ...`. `sessionId` null starts a new session; otherwise `--resume <id>`. `CLAUDE_CONFIG_DIR` is unset for the default `~/.claude` and set for other accounts; `TERM=xterm-256color`.
- **Switching** to another session does not stop the ones already running; they keep running in the background until closed, exited or the app quits.
- **Quit prompt:** closing the window while any pty runs shows a native box naming the running sessions with "Close them and quit" and "Go back". Only the first quits, and all ptys are killed on quit.
- **Packaging:** `node-pty` is unpacked from the asar (`asarUnpack`) and not rebuilt by electron-builder (`npmRebuild: false`; its N-API prebuilds cover Windows). `desktop/scripts/copy-vendor.cjs` copies xterm into `site/vendor/xterm/` (git-ignored) on install and before `dist`. CI runs `desktop/scripts/check-pty.cjs` under Electron's Node on Windows.

## Invariants

- The app never writes to an account folder except when installing or removing the limit reporter, and it backs up `settings.json` first.
- It never stores or reads sign-in tokens.

## Traps

- The installed app loads `site/js/*.js` from `resources/site`, outside any package.json, and Electron 33 runs Node 20, which does not guess ES module syntax (Node 22 does, so `npm test` and the dev app hid it). `site/package.json` marks the folder as ES modules; `tests/packaging.test.js` guards it. Found by Aj's first install on 2026-10-18.

- The walkthrough's first-run trigger was "no folders yet", which never happens in the app because it finds folders itself; the app now opens it on first run regardless.
- The installer is unsigned, so Windows SmartScreen warns on first run.
