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

// ---------- several windows ----------
// File shape (version 2): { version: 2, saved: [...], windows: [{ id, displayId, bounds, layout }] }.
// The older single-window shape { version: 1, current, saved } reads as one window with id 1 and no display.
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const goodBounds = (b) => isObj(b) && num(b.x) && num(b.y) && num(b.width) && num(b.height) && b.width > 0 && b.height > 0;

function normalizeLayoutFile(raw) {
  if (raw == null) return { version: 2, saved: [], windows: [] };
  if (!isObj(raw)) throw new Error('The layout file is not an object.');
  const saved = Array.isArray(raw.saved) ? raw.saved : [];
  let windows = [];
  if (Array.isArray(raw.windows)) {
    const seen = new Set();
    for (const w of raw.windows) {
      if (!isObj(w) || !Number.isInteger(w.id) || w.id < 1 || seen.has(w.id)) continue;
      seen.add(w.id);
      windows.push({ id: w.id, displayId: num(w.displayId) ? w.displayId : null, bounds: goodBounds(w.bounds) ? w.bounds : null, layout: isObj(w.layout) ? w.layout : null });
    }
  } else if (isObj(raw.current)) {
    windows = [{ id: 1, displayId: null, bounds: null, layout: raw.current }];
  }
  return { version: 2, saved, windows };
}

// Where a saved window opens. displays: [{ id, bounds, workArea }]. Falls back to the primary display when its display is gone.
function placeWindow(entry, displays, primaryId, def) {
  const size = def || { width: 1280, height: 820 };
  const primary = displays.find((d) => d.id === primaryId) || displays[0];
  if (!primary) return { width: size.width, height: size.height };
  const home = entry.displayId != null ? displays.find((d) => d.id === entry.displayId) : null;
  const target = home || primary;
  const area = target.workArea || target.bounds;
  const b = entry.bounds;
  const width = Math.min(b ? b.width : size.width, area.width);
  const height = Math.min(b ? b.height : size.height, area.height);
  const inside = b && b.x >= area.x && b.y >= area.y && b.x + width <= area.x + area.width && b.y + height <= area.y + area.height;
  if (home && inside) return { x: b.x, y: b.y, width, height };
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
}

module.exports = { readLayout, writeLayout, normalizeLayoutFile, placeWindow };
