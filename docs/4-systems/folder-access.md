# Folder access

## What it owns

Asking the browser for read access to each Claude account folder, remembering those folders between visits, and asking again when the browser has dropped the permission.

## How it works

Code: `site/js/sources/browser.js`.


The site calls `window.showDirectoryPicker()` once per account folder (for example `C:\Users\Aj\.claude`). The browser returns a folder handle; the site stores it in IndexedDB (the browser's own storage) so the next visit does not need the picker again, only one "Allow" tap. The folder handle never reveals the folder's full path, only its name, so the account is labelled with the folder name (`.claude`, `.claude-work`, and so on).

Only Chromium browsers (Edge, Chrome) have this feature. Firefox and Safari get a plain message saying so.

## Invariants

- Read-only by default. Write access is asked for only when Aj taps "Turn on limit tracking" (see [limit-reporter](limit-reporter.md)).
- A refused or expired permission shows a single "Allow again" button for that folder, never an error page.

## Traps

- Chromium refuses the home folder itself (`C:\Users\Aj`) but allows folders inside it. This comes from Chromium's blocked-path list and has not been tried on Aj's PC.
