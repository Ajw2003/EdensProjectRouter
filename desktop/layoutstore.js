'use strict';
// The grid layout file (userData/layout.json): read, and write atomically (temp file in the same folder, then rename).
const fs = require('fs');
const path = require('path');

// Returns the parsed object, or null when there is no file yet. Throws when the file cannot be read or is not JSON.
function readLayout(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('The saved layout file is damaged (' + e.message + '): ' + file);
  }
}

function writeLayout(file, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A layout object is needed.');
  const text = JSON.stringify(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* the temp file may not exist */ }
    throw e;
  }
}

module.exports = { readLayout, writeLayout };
