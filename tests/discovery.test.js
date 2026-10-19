import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSession, groupByProject, projectColor, contextWindowFor, PALETTE } from '../site/js/discovery.js';

const fx = (n) => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');

test('ai-title newest wins, Windows cwd gives project, newest branch', () => {
  const s = parseSession(fx('titled.jsonl'), { accountId: 'a1', file: 'aaa-111.jsonl', project: 'enc', mtimeMs: 1 });
  assert.equal(s.id, 'aaa-111');
  assert.equal(s.title, 'Spell picker sidebar');
  assert.equal(s.cwd, 'C:\\Users\\aj\\code\\plunderspell');
  assert.equal(s.project, 'plunderspell');
  assert.equal(s.gitBranch, 'feature/picker');
  assert.equal(s.contextTokens, 20 + 60000 + 20000);
  assert.equal(s.contextWindow, 200000);
  assert.equal(s.contextPct, 40);
  assert.equal(s.badLines, 0);
  assert.equal(s.lastActiveMs, Date.parse('2026-10-18T10:05:00.000Z'));
});

test('no ai-title: first user message cut to 60; empty gives Untitled', () => {
  const s = parseSession(fx('untitled.jsonl'), { accountId: 'a2', file: 'bbb-222.jsonl', mtimeMs: 1 });
  assert.equal(s.title.length, 60);
  assert.ok(s.title.startsWith('Please add the spell picker'));
  assert.equal(s.project, 'plunderspell');
  const e = parseSession('', { accountId: 'a2', file: 'x.jsonl', project: 'fallback', mtimeMs: 5 });
  assert.equal(e.title, 'Untitled session');
  assert.equal(e.project, 'fallback');
  assert.equal(e.lastActiveMs, 5);
});

test('context window: 200k, over 200k means 1M, 1m model id means 1M', () => {
  assert.equal(contextWindowFor('claude-opus-5-5', 200000), 200000);
  assert.equal(contextWindowFor('claude-opus-5-5', 200001), 1000000);
  assert.equal(contextWindowFor('claude-opus-5-5[1m]', 10), 1000000);
  const s = parseSession(fx('untitled.jsonl'), { accountId: 'a2', file: 'bbb-222.jsonl', mtimeMs: 1 });
  assert.equal(s.contextTokens, 251005);
  assert.equal(s.contextWindow, 1000000);
  assert.equal(s.contextPct, 25);
  const m = parseSession(fx('badlines.jsonl'), { accountId: 'a1', file: 'c.jsonl', mtimeMs: 1 });
  assert.equal(m.contextWindow, 1000000);
});

test('bad lines counted when not cut', () => {
  const s = parseSession(fx('badlines.jsonl'), { accountId: 'a1', file: 'c.jsonl', mtimeMs: 1 });
  assert.equal(s.badLines, 1);
  assert.equal(s.project, 'other');
});

test('cut read: join-point line and last partial line not counted, middle bad line is', () => {
  const lines = fx('badlines.jsonl').trim().split('\n');
  // head = line 0 ; tail = partial start + good line + bad middle + partial end
  const tailPartial = '{"type":"user","mess';
  const text = [lines[0], tailPartial, lines[2], 'garbage in middle', '{"type":"assis'].join('\n');
  const withJoin = parseSession(text, { accountId: 'a', file: 'c.jsonl', mtimeMs: 1, wasCut: true, joinLine: 1 });
  assert.equal(withJoin.badLines, 1);
  const noJoin = parseSession(text, { accountId: 'a', file: 'c.jsonl', mtimeMs: 1, wasCut: true });
  assert.equal(noJoin.badLines, 1);
  const uncut = parseSession(text, { accountId: 'a', file: 'c.jsonl', mtimeMs: 1 });
  assert.equal(uncut.badLines, 3);
});

test('grouping across two accounts into one project, newest first', () => {
  const a = parseSession(fx('titled.jsonl'), { accountId: 'a1', file: 'aaa-111.jsonl', mtimeMs: 1 });
  const b = parseSession(fx('untitled.jsonl'), { accountId: 'a2', file: 'bbb-222.jsonl', mtimeMs: 1 });
  const c = parseSession(fx('badlines.jsonl'), { accountId: 'a1', file: 'c.jsonl', mtimeMs: 1 });
  const groups = groupByProject([a, c, b]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].project, 'plunderspell');
  assert.deepEqual(groups[0].sessions.map((s) => s.accountId), ['a2', 'a1']);
  assert.equal(groups[0].lastActiveMs, b.lastActiveMs);
  assert.equal(groups[1].project, 'other');
  assert.equal(groups[0].color, projectColor('plunderspell'));
});

test('colour is stable, from the 8-colour palette, none amber or red', () => {
  assert.equal(PALETTE.length, 8);
  for (const n of ['plunderspell', 'other', 'x', 'EdensProjectRouter', '']) {
    assert.equal(projectColor(n), projectColor(n));
    assert.ok(PALETTE.includes(projectColor(n)));
  }
  for (const hex of PALETTE) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(!(r > 180 && g < 120 && b < 120), 'red-ish ' + hex);
    assert.ok(!(r > 180 && g > 120 && b < 100), 'amber-ish ' + hex);
  }
});

test('first-user fallback skips system-inserted and meta lines', () => {
  const u = (content, extra) => JSON.stringify({ type: 'user', message: { content }, ...extra });
  const text = [
    u('<task-notification>done</task-notification>'),
    u('<local-command-caveat>Caveat: x</local-command-caveat>'),
    u('meta text', { isMeta: true }),
    u('Fix the login page'),
  ].join('\n');
  const s = parseSession(text, { accountId: 'a', file: 'z.jsonl', mtimeMs: 1 });
  assert.equal(s.title, 'Fix the login page');
});
