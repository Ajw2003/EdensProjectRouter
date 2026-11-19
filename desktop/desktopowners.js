'use strict';
// Which login each desktop-app session belongs to. The Claude desktop app keeps one small local_*.json per session under
// <Claude-Data>/<package id>/claude-code-sessions/<accountUuid>/<orgUuid>/ (also in backlog and waiting-input sub-folders);
// the account is the folder name. Read-only: only the cliSessionId value of each file is used, nothing else is returned.
const fs = require('fs');
const path = require('path');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function dataBase(env, platform) {
  if (env.ROUTER_DESKTOP_DATA) return env.ROUTER_DESKTOP_DATA;
  return platform === 'win32' && env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Claude-Data') : null;
}

function entries(dir, warnings) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
    if (e && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') warnings.push('Could not list ' + dir + ': ' + e.message);
    return [];
  }
}

// Every local_*.json below dir, recursively.
function* sessionFiles(dir, warnings) {
  for (const e of entries(dir, warnings)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* sessionFiles(full, warnings);
    else if (e.isFile() && /^local_.*\.json$/.test(e.name)) yield full;
  }
}

function readCliSessionId(file, warnings) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = v && typeof v === 'object' ? v.cliSessionId : null;
    return typeof id === 'string' && ID_RE.test(id) ? id : null; // no id = a settings file (scheduled task)
  } catch (e) {
    warnings.push('Could not read ' + file + ': ' + e.message);
    return null;
  }
}

// -> { sessions: { cliSessionId: accountUuid }, accounts: [accountUuid], warnings: [string] }
function readDesktopOwners(env = process.env, platform = process.platform) {
  const out = { sessions: {}, accounts: [], warnings: [] };
  const base = dataBase(env, platform);
  if (!base) return out;
  const accounts = new Set();
  for (const pkg of entries(base, out.warnings)) {
    if (!pkg.isDirectory()) continue;
    const root = path.join(base, pkg.name, 'claude-code-sessions');
    for (const acct of entries(root, out.warnings)) {
      if (!acct.isDirectory() || !UUID_RE.test(acct.name)) continue;
      const uuid = acct.name.toLowerCase();
      accounts.add(uuid);
      for (const f of sessionFiles(path.join(root, acct.name), out.warnings)) {
        const id = readCliSessionId(f, out.warnings);
        if (id) out.sessions[id] = uuid;
      }
    }
  }
  out.accounts = [...accounts];
  return out;
}

module.exports = { readDesktopOwners };
