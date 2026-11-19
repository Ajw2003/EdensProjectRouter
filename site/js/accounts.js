// Pure helpers for accounts in the page: labels, the short-name rule, usage text, and the account for New session.
import { orderByRoom } from './limits.js';

// id -> name of another folder signed in with the same email (case-insensitive), for the note "same email as <folder>".
export function sameEmailNotes(accounts) {
  const first = new Map();
  const notes = {};
  for (const a of accounts || []) {
    const k = a.email ? String(a.email).trim().toLowerCase() : '';
    if (!k) continue;
    const f = first.get(k);
    if (f) { notes[a.id] = f.name; if (!(f.id in notes)) notes[f.id] = a.name; } else first.set(k, a);
  }
  return notes;
}

// The email when known, else the folder name.
export function accountLabel(a) {
  return (a && (a.email || a.name)) || '';
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
// Returns the trimmed short name, or throws a message fit to show (same rule as desktop/accounts.js).
export function validateAccountName(text) {
  const t = String(text == null ? '' : text).trim();
  if (!NAME_RE.test(t)) throw new Error('Use 1 to 32 letters, digits or dashes, starting with a letter or digit.');
  return t;
}

// "5-hour 12% · weekly 30%", or "no reading" when the router has not seen the account's limits.
export function usageText(lim) {
  if (!lim) return 'no reading';
  const p = (v) => (v == null ? '?' : Math.round(v) + '%');
  return '5-hour ' + p(lim.fiveHourPct) + ' · weekly ' + p(lim.weeklyPct);
}

// Menu rows for switching a tile away from accountId: [{ id, label, usage }].
export function switchTargets(accounts, limitsByAccount, accountId) {
  return (accounts || [])
    .filter((a) => a.id !== accountId && !a.needsPermission)
    .map((a) => ({ id: a.id, label: accountLabel(a), usage: usageText((limitsByAccount || {})[a.id]) }));
}

// The account New session uses: the one picked in the strip menu if it still exists, else the one with the most room.
export function chooseNewSessionAccount(accounts, preferredId, defaultId) {
  const ok = (accounts || []).some((a) => a.id === preferredId && !a.needsPermission);
  return ok ? preferredId : defaultId;
}

// Folders made by "Add account" this run, id -> { name, home }; a tile for one of them runs the sign-in.
export const pendingLogins = new Map();

// An account is full when its five-hour or weekly window is at 100 percent (accountLimits keeps the newest reading).
export function isFull(lim) {
  return !!lim && ((lim.fiveHourPct != null && lim.fiveHourPct >= 100) || (lim.weeklyPct != null && lim.weeklyPct >= 100));
}

// Where a session on a full account can continue: the other usable account with the most room that is not full, else null.
// A session on an account with room gets null (no button).
export function continueTarget(accounts, limitsByAccount, accountId) {
  const lim = limitsByAccount || {};
  if (!isFull(lim[accountId])) return null;
  const others = (accounts || []).filter((a) => a.id !== accountId && !a.needsPermission && !isFull(lim[a.id]));
  return orderByRoom(others, lim)[0] || null;
}

// The New session box's account list, most room first, the first one marked suggested: [{ id, label, usage, suggested }].
export function accountChoices(accounts, limitsByAccount) {
  const usable = (accounts || []).filter((a) => !a.needsPermission);
  return orderByRoom(usable, limitsByAccount).map((a, i) => ({ id: a.id, label: accountLabel(a), usage: usageText((limitsByAccount || {})[a.id]), suggested: i === 0 }));
}

// The account already added that a new one repeats, by folder (.claude-<name>) or by signed-in email; null when it is new.
export function duplicateAccount(accounts, { folder, email }) {
  const f = String(folder || '').toLowerCase();
  const e = String(email || '').trim().toLowerCase();
  return (accounts || []).find((a) => (f && String(a.name).toLowerCase() === f) || (e && a.email && String(a.email).toLowerCase() === e)) || null;
}

// Six distinct colours, each readable with white text (contrast 4.5 or more) on a light or a dark page.
export const ACCOUNT_PALETTE = ['#1d4ed8', '#b45309', '#047857', '#be185d', '#6d28d9', '#0e7490'];

// The account's colour: its place in the list sorted by name picks one of the six, so it does not change when the order of arrival does.
export function accountColor(accounts, id) {
  const sorted = [...(accounts || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
  const i = sorted.findIndex((a) => a.id === id);
  return ACCOUNT_PALETTE[(i < 0 ? 0 : i) % ACCOUNT_PALETTE.length];
}

// The short badge: the part of the email before the @, else the folder name without a leading ".claude-" (".claude" is "main").
export function badgeText(account) {
  const email = account && account.email ? String(account.email).trim() : '';
  const at = email.indexOf('@');
  if (at > 0) return email.slice(0, at);
  const name = account && account.name ? String(account.name) : '';
  if (name === '.claude') return 'main';
  return name.replace(/^\.claude-/, '') || 'main';
}

// The filter line's words. sessionsByAccount: { accountId: number of sessions }. selectedId null = all accounts.
export function filterSummary(accounts, sessionsByAccount, selectedId) {
  const by = sessionsByAccount || {};
  const plural = (n) => n + (n === 1 ? ' session' : ' sessions');
  const sel = selectedId ? (accounts || []).find((a) => a.id === selectedId) : null;
  if (sel) { const count = by[sel.id] || 0; return { text: badgeText(sel) + ' only · ' + plural(count), count }; }
  const count = (accounts || []).reduce((n, a) => n + (by[a.id] || 0), 0);
  return { text: 'All accounts (' + (accounts || []).length + ') · ' + plural(count), count };
}

// The remembered filter choice, per window when the page knows its window id; a stored id that is not a shown account falls back to null (All).
export function filterKey(winId) { return winId != null ? 'router.filterAccount.' + winId : 'router.filterAccount'; }
export function loadFilter(accounts, winId) {
  try {
    const v = localStorage.getItem(filterKey(winId));
    return v && (accounts || []).some((a) => a.id === v) ? v : null;
  } catch (e) { return null; }
}
export function saveFilter(id, winId) {
  try { if (id) localStorage.setItem(filterKey(winId), id); else localStorage.removeItem(filterKey(winId)); } catch (e) { /* works without storage */ }
}
