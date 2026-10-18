import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime, resetText, barLevel, resumeLine } from '../site/js/board.js';

test('relativeTime', () => {
  const n = 1e12;
  assert.equal(relativeTime(n - 10e3, n), 'just now');
  assert.equal(relativeTime(n - 2 * 60e3, n), '2 min ago');
  assert.equal(relativeTime(n - 3600e3, n), '1 hour ago');
  assert.equal(relativeTime(n - 5 * 3600e3, n), '5 hours ago');
  assert.equal(relativeTime(n - 86400e3, n), '1 day ago');
  assert.equal(relativeTime(n - 3 * 86400e3, n), '3 days ago');
  assert.equal(relativeTime(n + 5000, n), 'just now');
});
test('resetText same day and other day', () => {
  const now = new Date(2026, 9, 14, 9, 0).getTime(); // Wed
  assert.equal(resetText(new Date(2026, 9, 14, 16, 10).getTime(), now), 'resets 4:10pm');
  assert.equal(resetText(new Date(2026, 9, 14, 0, 5).getTime(), now), 'resets 12:05am');
  assert.equal(resetText(new Date(2026, 9, 14, 12, 0).getTime(), now), 'resets 12:00pm');
  assert.equal(resetText(new Date(2026, 9, 15, 9, 0).getTime(), now), 'resets Thu');
  assert.equal(resetText(null, now), '');
});
test('barLevel thresholds', () => {
  assert.equal(barLevel(0), 'ok');
  assert.equal(barLevel(69), 'ok');
  assert.equal(barLevel(70), 'warn');
  assert.equal(barLevel(89), 'warn');
  assert.equal(barLevel(90), 'hot');
  assert.equal(barLevel(100), 'hot');
});
test('resumeLine', () => {
  const s = { id: 'abc', cwd: 'C:\\code\\x' };
  assert.equal(resumeLine(s, '.claude'), 'cd "C:\\code\\x" && claude --resume abc');
  assert.equal(resumeLine(s, '.claude-work'), 'set CLAUDE_CONFIG_DIR=%USERPROFILE%\\.claude-work&& cd "C:\\code\\x" && claude --resume abc');
});
