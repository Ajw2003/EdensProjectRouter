# Router build spec

The build contract for issue #1 (Router prototype: a board of Claude Code sessions by project, as a website and a Windows app). Approved by Aj on 2026-10-18 with "Build plan approved: router windows app 1A 2A": limit tracking turns on with one tap per account, and the shared code is plain HTML and JavaScript with no build step. System docs: `docs/4-systems/`.

## Layout

```
site/                       the website, and the board the app loads
  index.html
  styles.css
  js/
    main.js                 boots: picks the desktop source when window.routerDesktop exists, else the browser source
    discovery.js            pure: transcript text -> session summary; grouping; context %; project colour
    limits.js               pure: status JSON -> limit readings; account "most room" ordering
    reporter.js             pure: the PowerShell reporter source, the statusLine command, settings.json install/remove
    board.js                renders the board from a model object
    walkthrough.js          first-run screens
    sources/browser.js      File System Access API source (Edge/Chrome)
    sources/desktop.js      thin wrapper over window.routerDesktop (Electron preload)
desktop/
  package.json              electron + electron-builder, scripts: start, dist
  main.js                   window, app:// protocol serving ../site, IPC handlers
  preload.js                exposes window.routerDesktop
  accounts.js               pure-ish: findAccounts(homeDir, env)
  launch.js                 pure: buildResumeCommand / buildNewSessionCommand
  fsSource.js               disk reads for the IPC handlers
tests/                      node --test, ES modules, fixtures in tests/fixtures/
package.json                root: "type": "module", script "test": "node --test tests/*.test.js" (Node 22 does not accept a bare folder)
.github/workflows/pages.yml     tests + deploy site/ to GitHub Pages on push to main
.github/workflows/desktop.yml   windows-latest: tests, reporter under Windows PowerShell 5.1, electron-builder NSIS; on tag v*: attach to a Release
```

Every module under `site/js` is a browser ES module with no imports outside `site/`, so Node's test runner can import the pure ones directly and Electron can load the same files.

## The source contract

`main.js` talks to one source object. Both `sources/browser.js` and `sources/desktop.js` implement it:

```
kind: "browser" | "desktop"
listAccounts() -> Promise<[{ id, name, needsPermission: bool }]>      // name = folder name, e.g. ".claude-work"
addAccount() -> Promise<account|null>                                  // browser: showDirectoryPicker; desktop: re-scan
grantPermission(id) -> Promise<bool>                                   // browser only; desktop returns true
listSessionFiles(id) -> Promise<[{ project, file, size, mtimeMs }]>    // top-level *.jsonl in each projects/<dir>/, no subfolders
readSessionText(id, project, file) -> Promise<{text, wasCut, joinLine?}> // first 64 KB (trimmed to whole lines) + last 256 KB; whole file if <= 320 KB. Pass wasCut and joinLine into parseSession meta
readStatus(id) -> Promise<[statusLineJson]>                            // every router/status/*.json in the account folder
reporterState(id) -> Promise<"on"|"off">
setReporter(id, on) -> Promise<void>                                   // uses reporter.js; backs up settings.json first
// desktop only (absent in browser):
resume(session) -> Promise<void>
newSession(cwd, accountId) -> Promise<void>
claudeRunning() -> Promise<bool>
```

## Data shapes

Session summary (from `discovery.parseSession(text, meta)`):
`{ id, accountId, title, cwd, project, gitBranch, lastActiveMs, model, contextTokens, contextWindow, contextPct, badLines }`

- `title`: newest `ai-title` line's `aiTitle`; else first user message text cut to 60 characters; else "Untitled session".
- `cwd`, `gitBranch`: newest line that has them. `project` = last path segment of `cwd` (split on `/` and `\`).
- `contextTokens`: newest `assistant` line's `message.usage`: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
- `contextWindow`: 1,000,000 if `contextTokens > 200000` or the model id contains `1m`; else 200,000.
- `badLines`: lines that were not valid JSON (the first and last line of a cut read are expected to be partial and are not counted).

Limit reading (from a status JSON written by the reporter): `{ sessionId, accountId, fiveHourPct, fiveHourResetsAt, weeklyPct, weeklyResetsAt, contextPct, repoName, savedAtMs }`. An account's limits are the newest reading for that account whose `resets_at` is still in the future.

Most-room order (`limits.orderByRoom(accounts, readings)`): lowest 5-hour % first, then lowest weekly %, accounts with no reading last, ties by name.

## Reporter

`router/status/<session id>.json` in the account folder, written by a Windows PowerShell 5.1 script passed as `-EncodedCommand` (UTF-16LE base64). It reads stdin, finds the account folder as three levels up from `transcript_path`, adds `savedAtMs`, writes the file, runs the previous status line command from `router/previous-statusline.txt` if present and prints its output, else prints `ctx 34% · 5h 12% · wk 40%`. Errors go to `router/reporter-errors.log`; it always exits 0.

`statusLine` value set: `{ "type": "command", "command": "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <b64>" }`. Install copies `settings.json` to `settings.json.router-backup` first (an absent file counts as `{}`). Remove restores the old `statusLine` from `router/previous-statusline.json`, or deletes the key if there was none.

## Board rules

One column per project, newest activity first, cards newest first. Project colour from a fixed 8-colour palette by a stable hash of the project name; none of the 8 is amber or red. Bars: calm blue under 70%, amber 70–89%, red 90% and above. A limit bar with no reading shows the text "Turn on limit tracking" as a button. Refresh every 5 seconds; re-parse only files whose size or mtime changed. Respect `prefers-reduced-motion`; light and dark themes from `prefers-color-scheme`. Plain words, large tap targets, no pop-ups the user didn't ask for.
