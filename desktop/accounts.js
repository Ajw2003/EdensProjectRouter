'use strict';
const fs = require('fs');
const path = require('path');

function hasProjects(dir) {
  try {
    return fs.statSync(path.join(dir, 'projects')).isDirectory();
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return false;
    throw e;
  }
}

// A freshly signed-in `.claude-<name>` folder has `.claude.json` but no `projects` yet.
function hasSignInFile(dir) {
  try {
    return fs.statSync(path.join(dir, '.claude.json')).isFile();
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return false;
    throw e;
  }
}

// -> [{ id, name, dir }]; id = folder name; ".claude" first, then by name.
function findAccounts(homeDir, env) {
  const found = new Map();
  const add = (dir) => {
    const resolved = path.resolve(dir);
    if (found.has(resolved)) return;
    const name = path.basename(resolved);
    found.set(resolved, { id: name, name, dir: resolved });
  };
  for (const e of fs.readdirSync(homeDir, { withFileTypes: true })) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (e.name !== '.claude' && !e.name.startsWith('.claude-')) continue;
    const dir = path.join(homeDir, e.name);
    if (hasProjects(dir) || (e.name !== '.claude' && hasSignInFile(dir))) add(dir);
  }
  const extra = env && env.CLAUDE_CONFIG_DIR;
  if (extra && hasProjects(extra)) add(extra);
  const list = [...found.values()];
  // A folder elsewhere with the same name as another would clash on id; keep ids unique.
  const seen = new Set();
  for (const a of list) {
    if (seen.has(a.id)) a.id = a.dir;
    seen.add(a.id);
  }
  const rank = (a) => (a.name === '.claude' ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// oauthAccount.emailAddress from <dir>/.claude.json; for the default ".claude" folder Claude Code keeps the file at
// <home>/.claude.json, so that is checked second. null when there is none; a file that exists but cannot be read or parsed
// is reported through log(message) and skipped.
function readEmail(dir, homeDir, log) {
  const files = [path.join(dir, '.claude.json')];
  if (homeDir && path.resolve(dir) === path.resolve(path.join(homeDir, '.claude'))) files.push(path.join(homeDir, '.claude.json'));
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) continue;
      if (log) log('Could not read ' + f + ': ' + e.message);
      continue;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      if (log) log('Could not parse ' + f + ': ' + e.message);
      continue;
    }
    const mail = json && json.oauthAccount && json.oauthAccount.emailAddress;
    if (typeof mail === 'string' && mail) return mail;
  }
  return null;
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
// Returns the trimmed short name for a new account, or throws a message fit to show.
function validateAccountName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name.trim())) {
    throw new Error('Use 1 to 32 letters, digits or dashes, starting with a letter or digit.');
  }
  return name.trim();
}

module.exports = { findAccounts, readEmail, validateAccountName };
