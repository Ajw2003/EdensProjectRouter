// Pure helpers for accounts in the page: labels, the short-name rule, usage text, and the account for New session.

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
