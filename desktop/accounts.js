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
    if (hasProjects(dir)) add(dir);
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

module.exports = { findAccounts };
