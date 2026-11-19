// Pure helpers for accounts in the page: labels, the short-name rule, usage text, and the account for New session.
import { orderByRoom } from './limits.js';

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
