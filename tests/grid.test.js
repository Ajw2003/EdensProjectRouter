import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  emptyLayoutFile, parseLayoutFile, serializeLayoutFile, withCurrent, withSaved, withoutSaved, findSaved,
  parsePercent, percentToPx, sizeFromPercent, planQuickLayout, QUICK_LAYOUTS,
} from '../site/js/grid.js';
import { lastMessages, lastActiveLabel, sessionTileKey } from '../site/js/tiles/session.js';
import { modelForProject } from '../site/js/tiles/projects.js';

const require = createRequire(import.meta.url);
const { readLayout, writeLayout } = require('../desktop/layoutstore.js');

// What dockview's toJSON() gives for two tiles side by side (shape only; the grid code treats it as opaque).
const dock = () => ({
  grid: { root: { type: 'branch', data: [{ type: 'leaf', data: { views: ['projects'], activeView: 'projects', id: '1' }, size: 320 }, { type: 'leaf', data: { views: ['a|1'], activeView: 'a|1', id: '2' }, size: 900 }], size: 700 }, width: 1220, height: 700, orientation: 'HORIZONTAL' },
  panels: {
    projects: { id: 'projects', contentComponent: 'tile', title: 'Projects', params: { kind: 'projects' } },
    'a|1': { id: 'a|1', contentComponent: 'tile', title: 'alpha task', params: { kind: 'session', accountId: 'a', sessionId: '1', project: 'alpha' } },
  },
  activeGroup: '2',
});

test('layout file: current layout and saved layouts survive serialize and parse', () => {
  let f = withCurrent(emptyLayoutFile(), dock());
  f = withSaved(f, 'Morning', dock());
  f = withSaved(f, 'Review', dock());
  const back = parseLayoutFile(serializeLayoutFile(f));
  assert.deepEqual(back, f);
  assert.deepEqual(back.current, dock());
  assert.deepEqual(back.saved.map((s) => s.name), ['Morning', 'Review']);
});

test('layout file: nothing yet gives an empty file; broken text throws; junk entries are dropped', () => {
  assert.deepEqual(parseLayoutFile(null), emptyLayoutFile());
  assert.deepEqual(parseLayoutFile(''), emptyLayoutFile());
  assert.throws(() => parseLayoutFile('{not json'));
  assert.throws(() => parseLayoutFile('[1,2]'));
  const f = parseLayoutFile({ current: { nope: 1 }, saved: [{ name: ' ', layout: dock() }, { name: 'ok', layout: dock() }, { name: 'bad', layout: 5 }, null] });
  assert.equal(f.current, null);
  assert.deepEqual(f.saved.map((s) => s.name), ['ok']);
});

test('saved layouts: same name replaces, delete and find work, bad names refused', () => {
  const other = { ...dock(), activeGroup: '1' };
  let f = withSaved(emptyLayoutFile(), 'Work', dock());
  f = withSaved(f, 'work', other);
  assert.equal(f.saved.length, 1);
  assert.equal(findSaved(f, 'work').layout.activeGroup, '1');
  assert.equal(findSaved(f, 'Work'), null);
  assert.deepEqual(withoutSaved(f, 'work').saved, []);
  assert.throws(() => withSaved(f, '  ', dock()), /name/);
  assert.throws(() => withSaved(f, 'x'.repeat(61), dock()), /60/);
  assert.throws(() => withSaved(f, 'ok', { grid: 1 }), /not a grid layout/);
  assert.throws(() => withCurrent(f, null), /not a grid layout/);
});

test('layout store: atomic write then read gives the same object and leaves no temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-layout-'));
  const file = path.join(dir, 'sub', 'layout.json');
  assert.equal(readLayout(file), null);
  const f = withSaved(withCurrent(emptyLayoutFile(), dock()), 'Morning', dock());
  writeLayout(file, f);
  writeLayout(file, f); // second write replaces the first
  assert.deepEqual(parseLayoutFile(readLayout(file)), f);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['layout.json']);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => readLayout(file), /damaged/);
  assert.throws(() => writeLayout(file, [1]), /layout object/);
});

test('percentages: parse, blank, and out of range', () => {
  assert.equal(parsePercent('30'), 30);
  assert.equal(parsePercent(' 30% '), 30);
  assert.equal(parsePercent('12.5'), 12.5);
  assert.equal(parsePercent(''), null);
  assert.equal(parsePercent(undefined), null);
  for (const bad of ['0', '-5', '101', 'abc', '3 0']) assert.throws(() => parsePercent(bad), /1 to 100/);
});

test('percentToPx and sizeFromPercent turn percentages of the window into pixels', () => {
  assert.equal(percentToPx(30, 1280), 384);
  assert.equal(percentToPx(100, 1280), 1280);
  assert.equal(percentToPx(0.01, 1280), 1);
  assert.equal(percentToPx(0, 1280), null);
  assert.equal(percentToPx(30, 0), null);
  assert.deepEqual(sizeFromPercent('30', '', { width: 1000, height: 700 }), { width: 300 });
  assert.deepEqual(sizeFromPercent('', '50%', { width: 1000, height: 700 }), { height: 350 });
  assert.deepEqual(sizeFromPercent('25', '50', { width: 1000, height: 700 }), { width: 250, height: 350 });
  assert.throws(() => sizeFromPercent('', ' ', { width: 1, height: 1 }), /width, a height/);
  assert.throws(() => sizeFromPercent('200', '', { width: 1, height: 1 }), /1 to 100/);
});

const T = (id, kind = 'session') => ({ id, kind });

test('quick layouts: slot counts and shapes', () => {
  const count = (k) => planQuickLayout(k, [T('projects', 'projects')], null).slots.length;
  assert.deepEqual(QUICK_LAYOUTS.map((q) => q.id), ['1', '2', '2x2', '3+1', 'projects']);
  assert.deepEqual(['1', '2', '2x2', '3+1', 'projects'].map(count), [1, 2, 4, 4, 1]);
  const q = planQuickLayout('2x2', [], null).slots;
  assert.deepEqual(q.map((s) => [s.ref, s.dir || null]), [[null, null], [0, 'right'], [0, 'below'], [1, 'below']]);
  const t = planQuickLayout('3+1', [], null).slots;
  assert.deepEqual(t.map((s) => [s.ref, s.dir || null]), [[null, null], [0, 'right'], [1, 'below'], [2, 'below']]);
  assert.throws(() => planQuickLayout('nope', [], null), /Unknown layout/);
});

test('quick layouts: tiles go to slots in order, projects first, extras become tabs of the last slot', () => {
  const tiles = [T('s1'), T('projects', 'projects'), T('s2'), T('s3'), T('s4'), T('s5')];
  const p = planQuickLayout('2x2', tiles, null);
  assert.deepEqual(p.assign, [['projects'], ['s1'], ['s2'], ['s3', 's4', 's5']]);
  assert.deepEqual(p.active, ['projects', 's1', 's2', 's3']);
  const two = planQuickLayout('2', tiles.slice(0, 3), null);
  assert.deepEqual(two.assign, [['projects'], ['s1', 's2']]);
  const few = planQuickLayout('2x2', [T('projects', 'projects'), T('s1')], null);
  assert.deepEqual(few.assign, [['projects'], ['s1'], [], []]);
  assert.deepEqual(few.active, ['projects', 's1', null, null]);
});

test('quick layout 1: the active tile is shown, the rest are tabs behind it', () => {
  const tiles = [T('projects', 'projects'), T('s1'), T('s2')];
  assert.deepEqual(planQuickLayout('1', tiles, 's2').assign, [['s2', 'projects', 's1']]);
  assert.deepEqual(planQuickLayout('1', tiles, 'gone').assign, [['projects', 's1', 's2']]);
  assert.deepEqual(planQuickLayout('1', [], null).assign, [[]]);
});

test('Projects only: every open tile becomes a tab of one group with the projects tile shown', () => {
  const p = planQuickLayout('projects', [T('s1'), T('projects', 'projects'), T('s2')], 's1');
  assert.deepEqual(p.assign, [['projects', 's1', 's2']]);
  assert.deepEqual(p.active, ['projects']);
  assert.equal(p.needProjects, false);
  const none = planQuickLayout('projects', [T('s1')], null);
  assert.equal(none.needProjects, true);
  assert.deepEqual(none.assign, [['s1']]);
  assert.deepEqual(none.active, [null]);
});

test('quick layout sizes: percentages sum to 100 along each split', () => {
  const s = planQuickLayout('2x2', [], null).slots;
  assert.equal(s[0].widthPct + s[1].widthPct, 100);
  assert.equal(s[0].heightPct + s[2].heightPct, 100);
  const c = planQuickLayout('3+1', [], null).slots;
  assert.equal(c[0].widthPct + c[1].widthPct, 100);
  assert.equal(c[1].heightPct + c[2].heightPct + c[3].heightPct, 100);
});

test('session tile helpers: key, last 3 messages, last active text', () => {
  assert.equal(sessionTileKey({ accountId: 'a', sessionId: '9' }), 'a|9');
  assert.equal(sessionTileKey({ accountId: 'a', sessionId: null, key: 'new:x' }), 'new:x');
  const entries = [
    { kind: 'you', text: 'one' }, { kind: 'tool', summary: 'Ran ls' }, { kind: 'claude', text: 'two' },
    { kind: 'you', text: 'three' }, { kind: 'tool', summary: 'Read a' }, { kind: 'claude', text: 'x'.repeat(2000) },
  ];
  const m = lastMessages(entries);
  assert.deepEqual(m.map((x) => x.kind), ['claude', 'you', 'claude']);
  assert.equal(m[0].text, 'two');
  assert.ok(m[2].text.length <= 601 && m[2].text.endsWith('…'));
  assert.deepEqual(lastMessages([]), []);
  const now = 1_000_000_000;
  assert.equal(lastActiveLabel(now - 5 * 60000, now), 'Last active 5 min ago');
  assert.equal(lastActiveLabel(0, now), 'No activity recorded yet');
});

test('project tile model keeps only its project', () => {
  const model = { nowMs: 1, groups: [{ project: 'a', sessions: [] }, { project: 'b', sessions: [] }] };
  assert.deepEqual(modelForProject(model, 'b').groups.map((g) => g.project), ['b']);
  assert.equal(modelForProject(model, 'b').nowMs, 1);
});
