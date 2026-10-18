import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { liveAfterSnapshot } from '../site/js/terminal.js';

const require = createRequire(import.meta.url);
const { readLayout, writeLayout, normalizeLayoutFile, placeWindow } = require('../desktop/layoutstore.js');
const { createRingBuffer, createPtyManager } = require('../desktop/pty.js');

const dock = (tag) => ({ grid: { root: { type: 'leaf', data: { views: [tag] } } }, panels: { [tag]: { id: tag } } });
const displays = [
  { id: 10, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { id: 20, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1040 } },
];

test('layout file: the old single-window shape reads as window 1', () => {
  const f = normalizeLayoutFile({ version: 1, current: dock('a'), saved: [{ name: 'M', layout: dock('b') }] });
  assert.equal(f.version, 2);
  assert.equal(f.windows.length, 1);
  assert.deepEqual(f.windows[0], { id: 1, displayId: null, bounds: null, layout: dock('a') });
  assert.equal(f.saved.length, 1);
});

test('layout file: nothing yet gives no windows; a non-object throws', () => {
  assert.deepEqual(normalizeLayoutFile(null), { version: 2, saved: [], windows: [] });
  assert.throws(() => normalizeLayoutFile([1]), /not an object/);
});

test('layout file: several windows round-trip through the file; junk entries are dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-win-'));
  const file = path.join(dir, 'layout.json');
  const bounds = { x: 5, y: 6, width: 700, height: 500 };
  writeLayout(file, { version: 2, saved: [], windows: [
    { id: 1, displayId: 10, bounds, layout: dock('a') },
    { id: 2, displayId: 20, bounds: { x: 2000, y: 10, width: 800, height: 600 }, layout: dock('b') },
    { id: 2, displayId: 1, bounds: null, layout: null }, // duplicate id
    { id: 0, layout: dock('c') }, // bad id
    { id: 3, displayId: 'x', bounds: { x: 1 }, layout: 5 }, // bad fields become null
  ] });
  const f = normalizeLayoutFile(readLayout(file));
  assert.deepEqual(f.windows.map((w) => w.id), [1, 2, 3]);
  assert.deepEqual(f.windows[0], { id: 1, displayId: 10, bounds, layout: dock('a') });
  assert.deepEqual(f.windows[2], { id: 3, displayId: null, bounds: null, layout: null });
});

test('placeWindow: kept on its display, or moved to the primary one when that display is gone', () => {
  const b = { x: 2000, y: 10, width: 800, height: 600 };
  assert.deepEqual(placeWindow({ displayId: 20, bounds: b }, displays, 10), b);
  const gone = placeWindow({ displayId: 99, bounds: b }, displays, 10);
  assert.deepEqual(gone, { x: 560, y: 220, width: 800, height: 600 });
  const old = placeWindow({ displayId: null, bounds: null }, displays, 10);
  assert.equal(old.width, 1280);
  assert.ok(old.x >= 0 && old.x + old.width <= 1920);
  assert.deepEqual(placeWindow({ displayId: 1, bounds: null }, [], 1), { width: 1280, height: 820 });
});

test('ring buffer: keeps only the last max characters and counts everything pushed', () => {
  const r = createRingBuffer(10);
  r.push('abcde');
  r.push('fgh');
  assert.deepEqual(r.snapshot(), { data: 'abcdefgh', end: 8 });
  r.push('ijklmn');
  assert.deepEqual(r.snapshot(), { data: 'efghijklmn', end: 14 });
  r.push('x'.repeat(25));
  assert.equal(r.snapshot().data, 'x'.repeat(10));
  assert.equal(r.snapshot().end, 39);
});

test('ring buffer: the default keeps 256 KB', () => {
  const r = createRingBuffer();
  r.push('a'.repeat(300 * 1024));
  assert.equal(r.snapshot().data.length, 256 * 1024);
});

test('pty manager: buffer(ptyId) returns the kept output with an end offset, and null for an unknown pty', () => {
  let dataCb;
  const seen = [];
  const m = createPtyManager({
    onData: (id, d, end) => seen.push([id, d, end]),
    onExit() {},
    spawnFn: () => ({ onData: (cb) => { dataCb = cb; }, onExit() {}, write() {}, resize() {}, kill() {} }),
  });
  const id = m.open({ file: 'x', args: [], cwd: '/', env: {} }, {}, 80, 24);
  dataCb('hello ');
  dataCb('world');
  assert.deepEqual(seen, [[id, 'hello ', 6], [id, 'world', 11]]);
  assert.deepEqual(m.buffer(id), { data: 'hello world', end: 11 });
  assert.equal(m.buffer('nope'), null);
});

test('liveAfterSnapshot: drops chunks the snapshot holds and cuts a half-covered one', () => {
  const chunks = [{ data: 'abc', end: 3 }, { data: 'defg', end: 7 }, { data: 'hi', end: 9 }];
  assert.deepEqual(liveAfterSnapshot(chunks, 5), ['fg', 'hi']);
  assert.deepEqual(liveAfterSnapshot(chunks, 9), []);
  assert.deepEqual(liveAfterSnapshot(chunks, 0), ['abc', 'defg', 'hi']);
});
