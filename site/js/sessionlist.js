// The calm shell's session list (app only): Today, Earlier with "Show N more", stars, a green working dot and an orange waiting dot.
// Pure helpers are exported for tests; the DOM is built with textContent only.
import { relativeTime } from './board.js';
import { nestSessions } from './handoff.js';
import { accountColor, badgeText } from './accounts.js';
import { cloudNotice } from './cloudlist.js';

const WORKING_MS = 30000;
export const EARLIER_STEP = 5;
const STARS_KEY = 'router.stars';

export const keyOf = (s) => s.accountId + '|' + s.id;

// Every session, newest first, with the ones from today (local time) apart.
export function splitDay(groups, nowMs, query, accountId) {
  const q = String(query || '').trim().toLowerCase();
  const all = (groups || []).flatMap((g) => g.sessions)
    .filter((s) => !accountId || (s.ownerId || s.accountId) === accountId)
    .filter((s) => !q || [s.title, s.project, s.cwd].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.lastActiveMs - a.lastActiveMs);
  const midnight = new Date(nowMs);
  midnight.setHours(0, 0, 0, 0);
  return { today: all.filter((s) => s.lastActiveMs >= midnight.getTime()), earlier: all.filter((s) => s.lastActiveMs < midnight.getTime()) };
}

// The first `count` earlier sessions plus every starred one; `more` is how many are still hidden.
export function limitEarlier(earlier, count, stars) {
  const shown = earlier.filter((s, i) => i < count || stars.has(keyOf(s)));
  return { shown, more: earlier.length - shown.length };
}

function loadStars() {
  try { return new Set(JSON.parse(localStorage.getItem(STARS_KEY) || '[]')); } catch (e) { return new Set(); }
}
function saveStars(set) {
  try { localStorage.setItem(STARS_KEY, JSON.stringify([...set])); } catch (e) { /* works without storage */ }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function dot(cls, label) {
  const d = el('span', cls);
  d.title = label;
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', label);
  return d;
}

// The coloured badge with the account's short name.
export function accountBadge(accounts, acct) {
  const b = el('span', 'acct-badge', badgeText(acct));
  b.style.background = accountColor(accounts, acct.id);
  b.title = acct.email || acct.name;
  return b;
}

function row(s, model, h, ctx, depth) {
  const k = keyOf(s);
  const wrap = el('div', 'srow-wrap' + (depth ? ' srow-child' : ''));
  if (depth) wrap.style.marginLeft = depth * 16 + 'px';
  const b = el('button', 'srow' + (ctx.selected.has(k) ? ' selected' : ''));
  b.type = 'button';
  b.draggable = !s.cloud; // a cloud session has no local file to drop on a pane
  if (ctx.selected.has(k)) b.setAttribute('aria-current', 'true');
  const top = el('span', 'srow-top');
  if (model.waitingKeys && model.waitingKeys.has(k)) top.appendChild(dot('waiting-dot', 'needs you'));
  else if (model.nowMs - s.lastActiveMs < WORKING_MS || (model.runningKeys && model.runningKeys.has(k))) top.appendChild(dot('working-dot', 'working now'));
  if (s.cloud) {
    const ic = el('span', 'cloud-icon', '☁');
    ic.setAttribute('role', 'img');
    ic.setAttribute('aria-label', 'cloud');
    top.appendChild(ic);
  }
  top.appendChild(el('span', 'srow-title', s.title));
  b.appendChild(top);
  const meta = el('span', 'srow-meta');
  const acct = (model.accounts || []).find((x) => x.id === (s.ownerId || s.accountId));
  if (acct) meta.appendChild(accountBadge(model.accounts, acct));
  meta.appendChild(document.createTextNode(s.cloud ? 'cloud · ' + (s.status || 'unknown') + ' · ' + relativeTime(s.lastActiveMs, model.nowMs) : s.project + ' · ' + relativeTime(s.lastActiveMs, model.nowMs)));
  b.appendChild(meta);
  b.addEventListener('click', (ev) => (ev.ctrlKey || ev.metaKey ? h.onOpenBeside(s) : h.onOpen(s)));  // a cloud click opens the cloud pane
  b.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('application/x-router-session', JSON.stringify({ accountId: s.accountId, id: s.id }));
    ev.dataTransfer.effectAllowed = 'copy';
  });
  const starred = ctx.stars.has(k);
  const star = el('button', 'pin-btn' + (starred ? ' on' : ''), starred ? '★' : '☆');
  star.type = 'button';
  star.setAttribute('aria-pressed', String(starred));
  star.setAttribute('aria-label', (starred ? 'Unstar ' : 'Star ') + s.title);
  star.title = starred ? 'Unstar' : 'Star';
  star.addEventListener('click', () => { if (starred) ctx.stars.delete(k); else ctx.stars.add(k); saveStars(ctx.stars); ctx.redraw(); });
  const beside = el('button', 'send-btn', 'Open beside');
  beside.type = 'button';
  beside.title = 'Open ' + s.title + ' next to the sessions that are open';
  beside.setAttribute('aria-label', 'Open ' + s.title + ' beside');
  beside.addEventListener('click', () => h.onOpenBeside(s));
  if (s.cloud) wrap.append(b, star);
  else wrap.append(b, beside, star);
  return wrap;
}

// container: the list body. h = { onOpen(s), onOpenBeside(s) }. state = { query, earlierCount, selectedKeys: Set } kept by the caller.
export function renderSessionList(container, model, h, state) {
  const stars = container._stars || (container._stars = loadStars());
  const ctx = { stars, selected: state.selectedKeys, redraw: () => renderSessionList(container, model, h, state) };
  const { today, earlier } = splitDay(model.groups, model.nowMs, state.query, state.accountId);
  container.textContent = '';
  // Calm sign-in notices, one per account, above everything; local rows are never held back by them.
  for (const a of model.accounts || []) {
    if (state.accountId && a.id !== state.accountId) continue;
    const n = cloudNotice((model.cloudStates || {})[a.id]);
    if (!n) continue;
    const r = el('div', 'cloud-notice');
    r.setAttribute('role', 'status');
    r.appendChild(accountBadge(model.accounts, a));
    const sr = (model.signInRefresh || {})[a.id] || {};
    r.appendChild(el('span', 'cloud-notice-text', n.text + (sr.problem ? ' Refresh did not help: ' + sr.problem : '')));
    if (n.refresh && h.onRefreshSignIn) {
      const b = el('button', 'btn', sr.running ? 'Refreshing…' : 'Refresh');
      b.type = 'button';
      b.disabled = !!sr.running;
      b.addEventListener('click', () => h.onRefreshSignIn(a.id));
      r.appendChild(b);
    }
    container.appendChild(r);
  }
  const section = (title, list) => {
    const sec = el('section', 'proj');
    sec.appendChild(el('h2', 'list-head', title));
    for (const { s, depth } of nestSessions(list, model.parents)) sec.appendChild(row(s, model, h, ctx, depth));
    container.appendChild(sec);
  };
  // Needs you: every session waiting on a question or permission, across projects and accounts, newest first.
  const shownAcct = (model.accounts || []).find((x) => x.id === state.accountId);
  const needsShown = (model.needs || []).filter((x) => !state.accountId || x.accountId === state.accountId || (shownAcct && (shownAcct.memberIds || []).includes(x.accountId)));
  if (needsShown.length) {
    const sec = el('section', 'proj needs-you');
    sec.setAttribute('aria-label', 'Needs you');
    sec.appendChild(el('h2', 'list-head', 'Needs you'));
    for (const n of needsShown) {
      const b = el('button', 'srow needs-row');
      b.type = 'button';
      const top = el('span', 'srow-top');
      top.append(dot('waiting-dot', 'needs you'), el('span', 'srow-title', n.project));
      const a = (model.accounts || []).find((x) => x.id === n.accountId);
      top.appendChild(el('span', 'needs-acct', a ? a.name : n.accountId));
      b.append(top, el('span', 'srow-meta', n.what));
      b.addEventListener('click', () => h.onNeedsOpen(n));
      sec.appendChild(b);
    }
    container.appendChild(sec);
  }
  if (!today.length && !earlier.length) container.appendChild(el('p', 'list-empty', state.query.trim() ? 'Nothing matches that search.' : 'No sessions yet.'));
  if (today.length) section('Today', today);
  if (earlier.length) {
    const { shown, more } = limitEarlier(earlier, state.earlierCount, stars);
    section('Earlier', shown);
    if (more > 0) {
      const b = el('button', 'show-all', 'Show ' + Math.min(more, EARLIER_STEP) + ' more');
      b.type = 'button';
      b.addEventListener('click', () => { state.earlierCount += EARLIER_STEP; ctx.redraw(); });
      container.appendChild(b);
    }
  }
}
