// The folding, searchable project list. Pure helpers are exported for tests; renderList builds DOM with textContent only.
import { relativeTime, barLevel } from './board.js';

const WORKING_MS = 30000;

export function filterGroups(groups, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return groups;
  const has = (v) => String(v || '').toLowerCase().includes(q);
  const out = [];
  for (const g of groups) {
    if (has(g.project)) { out.push(g); continue; }
    const sessions = g.sessions.filter((s) => has(s.title) || has(s.cwd));
    if (sessions.length) out.push({ ...g, sessions });
  }
  return out;
}

export function splitRecent(sessions, nowMs, days = 7) {
  const cutoff = nowMs - days * 86400000;
  const recent = [], older = [];
  for (const s of sessions) (s.lastActiveMs >= cutoff ? recent : older).push(s);
  return { recent, older };
}

const KEY = 'router.list';
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { folded: v.folded && typeof v.folded === 'object' ? v.folded : {}, query: typeof v.query === 'string' ? v.query : '' };
  } catch (e) { return { folded: {}, query: '' }; }
}
function save(ls) {
  try { localStorage.setItem(KEY, JSON.stringify({ folded: ls.folded, query: ls.query })); } catch (e) { /* works without storage */ }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const keyOf = (s) => s.accountId + '|' + s.id;

function sessionRow(s, model, h, st, rerender) {
  const sel = st.selectedKey === keyOf(s);
  const b = el('button', 'srow' + (sel ? ' selected' : ''));
  b.type = 'button';
  if (sel) b.setAttribute('aria-current', 'true');
  const top = el('span', 'srow-top');
  if (model.nowMs - s.lastActiveMs < WORKING_MS) {
    const dot = el('span', 'working-dot');
    dot.title = 'working now';
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'working now');
    top.appendChild(dot);
  }
  top.appendChild(el('span', 'srow-title', s.title));
  b.appendChild(top);
  const meta = el('span', 'srow-meta');
  meta.appendChild(el('span', '', relativeTime(s.lastActiveMs, model.nowMs)));
  const p = Math.max(0, Math.min(100, Math.round(s.contextPct || 0)));
  const track = el('span', 'ctx-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Context');
  track.setAttribute('aria-valuenow', String(p));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = el('span', 'fill ' + barLevel(p));
  fill.style.width = p + '%';
  track.appendChild(fill);
  meta.appendChild(track);
  b.appendChild(meta);
  b.addEventListener('click', () => {
    st.selectedKey = keyOf(s);
    if (h && h.onOpen) h.onOpen(s);
    rerender();
  });
  return b;
}

function draw(root) {
  const { model, h, st } = root._last;
  const ls = root._listState;
  const searching = ls.query.trim() !== '';
  const groups = filterGroups(model.groups || [], ls.query);
  const body = root._listBody;
  body.textContent = '';
  const rerender = () => draw(root);
  if (!groups.length) body.appendChild(el('p', 'list-empty', searching ? 'Nothing matches that search.' : 'No sessions yet.'));
  for (const g of groups) {
    const open = searching || !ls.folded[g.project];
    const sec = el('section', 'proj');
    sec.style.setProperty('--stripe', g.color);
    const head = el('div', 'proj-head');
    const tog = el('button', 'proj-toggle');
    tog.type = 'button';
    tog.setAttribute('aria-expanded', String(open));
    tog.appendChild(el('span', 'arrow', open ? '▾' : '▸'));
    tog.appendChild(el('span', 'proj-name', g.project));
    tog.appendChild(el('span', 'proj-count', String(g.sessions.length)));
    tog.addEventListener('click', () => {
      if (searching) return;
      ls.folded[g.project] = !ls.folded[g.project];
      save(ls);
      rerender();
    });
    head.appendChild(tog);
    if (model.kind === 'desktop' && h && h.onNewSession) {
      const nb = el('button', 'btn small', 'New session');
      nb.type = 'button';
      nb.addEventListener('click', () => h.onNewSession(g.project, (g.sessions[0] && g.sessions[0].cwd) || ''));
      head.appendChild(nb);
    }
    sec.appendChild(head);
    if (open) {
      const { recent, older } = splitRecent(g.sessions, model.nowMs);
      for (const s of recent) sec.appendChild(sessionRow(s, model, h, st, rerender));
      if (older.length) {
        // Older starts folded: folded[key] === false means the user opened it.
        const key = g.project + '\u0000older';
        const oOpen = searching || ls.folded[key] === false;
        const oh = el('button', 'older-head');
        oh.type = 'button';
        oh.setAttribute('aria-expanded', String(oOpen));
        oh.textContent = (oOpen ? '▾' : '▸') + ' Older (' + older.length + ')';
        oh.addEventListener('click', () => {
          if (searching) return;
          ls.folded[key] = oOpen;
          save(ls);
          rerender();
        });
        sec.appendChild(oh);
        if (oOpen) for (const s of older) sec.appendChild(sessionRow(s, model, h, st, rerender));
      }
    }
    body.appendChild(sec);
  }
}

// The search input is built once, so it keeps focus and caret across refreshes.
export function renderList(container, model, handlers, state) {
  const st = state || container._stateObj || (container._stateObj = {});
  if (!container._listState) {
    const ls = container._listState = load();
    container.textContent = '';
    const input = el('input', 'list-search');
    input.type = 'search';
    input.placeholder = 'Search projects and sessions';
    input.setAttribute('aria-label', 'Search projects and sessions');
    input.value = ls.query;
    input.addEventListener('input', () => {
      ls.query = input.value;
      save(ls);
      draw(container);
    });
    container.appendChild(input);
    container._listBody = el('div', 'list-body');
    container.appendChild(container._listBody);
  }
  container._last = { model, h: handlers, st };
  draw(container);
}
