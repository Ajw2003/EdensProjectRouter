// Pure helpers for accounts in the page: labels, the short-name rule, usage text, and the account for New session.
import { orderByRoom } from './limits.js';

// The login a folder holds: its accountUuid when known, else the lower-cased email, else the folder id (an unknown stays unique).
export function loginKey(a) {
  if (a.accountUuid) return 'u:' + a.accountUuid;
  const e = a.email ? String(a.email).trim().toLowerCase() : '';
  return e ? 'e:' + e : 'f:' + a.id;
}

// id -> "same login as <folder>" (or "same email as <folder>" when only emails are known) for folders that hold one login.
export function sameLoginNotes(accounts) {
  const first = new Map();
  const notes = {};
  for (const a of accounts || []) {
    const k = loginKey(a);
    if (k.startsWith('f:')) continue;
    const f = first.get(k);
    if (!f) { first.set(k, a); continue; }
    const word = k.startsWith('u:') ? 'login' : 'email';
    notes[a.id] = 'same ' + word + ' as ' + f.name;
    if (!(f.id in notes)) notes[f.id] = 'same ' + word + ' as ' + a.name;
  }
  return notes;
}

// One display account per login. The primary is the folder named ".claude" if the login has it, else the first by name
// (case-insensitive); it carries memberIds, the ids of the other folders of that login. Order follows the first folder seen.
export function groupLogins(accounts) {
  const groups = new Map();
  for (const a of accounts || []) {
    const k = loginKey(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const byName = (x, y) => String(x.name).toLowerCase().localeCompare(String(y.name).toLowerCase());
  return [...groups.values()].map((g) => {
    const primary = g.find((a) => a.name === '.claude') || [...g].sort(byName)[0];
    return { ...primary, memberIds: g.filter((a) => a !== primary).map((a) => a.id) };
  });
}

// A display account for a login the desktop app has sessions for but that has no folder (it has nowhere to start a session).
function desktopOnlyAccount(uuid) {
  const tail = uuid.slice(-6);
  return { id: 'desktop-' + tail, name: 'Desktop ' + tail, email: '', accountUuid: uuid, desktopOnly: true, needsPermission: false, memberIds: [] };
}

// Desktop-only display accounts: logins in desktop.accounts that no folder in `accounts` holds.
export function desktopOnlyAccounts(accounts, desktop) {
  const have = new Set((accounts || []).map((a) => a.accountUuid).filter(Boolean));
  return ((desktop && desktop.accounts) || []).filter((u) => !have.has(u)).map(desktopOnlyAccount);
}

// The display owner of a session, for badges and filters only (never for resume, read or copy, which use session.accountId):
// the login the desktop app ran it under when known, else the login of the folder it is stored in.
export function ownerId(session, accounts, desktop) {
  const groups = groupLogins(accounts);
  const uuid = desktop && desktop.sessions && desktop.sessions[session.id];
  if (uuid) {
    const g = groups.find((a) => a.accountUuid === uuid);
    return g ? g.id : desktopOnlyAccount(uuid).id;
  }
  const own = groups.find((a) => a.id === session.accountId || a.memberIds.includes(session.accountId));
  return own ? own.id : session.accountId;
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
  const others = (accounts || []).filter((a) => a.id !== accountId && !a.needsPermission && !a.desktopOnly && !isFull(lim[a.id]));
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
