'use strict';
// Read-only check: how many sessions each display account owns on this machine. Usage: node check-real-accounts.cjs [homeDir]
// Prints badges, masked emails and counts only; no tokens, no message text, writes nothing. Transcripts are counted by file name
// (<sessionId>.jsonl); hidden folders (an app setting) are not applied here. ROUTER_DESKTOP_DATA overrides the desktop data folder.
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { findAccounts, readLogin } = require('../accounts');
const { readDesktopOwners } = require('../desktopowners');
const { listSessionFiles } = require('../fsSource');

const mask = (e) => (e ? e.replace(/^(.{0,2})[^@]*@/, (_m, a) => a + '***@') : '(no email)');
const tail = (u) => (u ? u.slice(-6) : '(unknown)');

async function main() {
  const home = path.resolve(process.argv[2] || os.homedir());
  const A = await import(pathToFileURL(path.join(__dirname, '..', '..', 'site', 'js', 'accounts.js')).href);
  const folders = findAccounts(home, {}).map((f) => ({ ...f, ...readLogin(f.dir, home, (m) => console.error(m)) }));
  const desktop = readDesktopOwners();
  desktop.warnings.forEach((m) => console.error(m));
  const sessions = [];
  for (const f of folders) {
    for (const t of await listSessionFiles(f.dir)) sessions.push({ id: t.file.replace(/\.jsonl$/, ''), accountId: f.id });
  }
  const display = [...A.groupLogins(folders), ...A.desktopOnlyAccounts(folders, desktop)];
  const counts = {};
  let noOwner = 0;
  for (const s of sessions) {
    const o = A.ownerId(s, folders, desktop);
    counts[o] = (counts[o] || 0) + 1;
    if (!desktop.sessions[s.id]) noOwner++;
  }
  console.log('folders ' + folders.length + ', logins ' + display.length + ', transcripts ' + sessions.length + ', desktop sessions ' + Object.keys(desktop.sessions).length);
  for (const a of display) {
    console.log(A.badgeText(a).padEnd(16) + mask(a.email).padEnd(28) + '...' + tail(a.accountUuid) + '  ' + (counts[a.id] || 0) + ' sessions' + (a.desktopOnly ? ' (desktop only)' : ''));
  }
  console.log('transcripts with no desktop owner (shown under their folder): ' + noOwner);
}

main().catch((e) => { console.error('check failed: ' + e.message); process.exit(1); });
