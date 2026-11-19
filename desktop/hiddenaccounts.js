'use strict';
// The folders Aj hid from the router, kept in the app's own user-data file {hidden:[folderName,...]}.
// Never writes inside a Claude folder. A missing file means none hidden; a broken one means none hidden plus a warning.
const fs = require('fs');

function loadHidden(file, warn = console.error) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (!e || e.code !== 'ENOENT') warn('hidden accounts file could not be read, showing all folders: ' + (e && e.message ? e.message : e));
    return [];
  }
  try {
    const v = JSON.parse(text);
    if (!v || !Array.isArray(v.hidden)) throw new Error('no "hidden" list');
    return v.hidden.filter((x) => typeof x === 'string');
  } catch (e) {
    warn('hidden accounts file is broken, showing all folders: ' + e.message);
    return [];
  }
}

function saveHidden(file, names) {
  fs.writeFileSync(file, JSON.stringify({ hidden: [...new Set(names)] }, null, 2));
}

// Returns the new hidden list after hiding or showing one folder.
function setHidden(file, name, hidden, warn) {
  const rest = loadHidden(file, warn).filter((n) => n !== name);
  const next = hidden ? [...rest, name] : rest;
  saveHidden(file, next);
  return next;
}

module.exports = { loadHidden, saveHidden, setHidden };
