// The folding, searchable project list. Pure helpers are exported for tests; renderList builds DOM with textContent only.
import { relativeTime, barLevel } from './board.js';
import { limitSessions, clampCount, DEFAULT_COUNT } from './sessionlimit.js';
import { nestSessions } from './handoff.js';

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
// limits[project] = { count, pins: [session ids], all: expanded to every session }
export function normalizeState(v) {
  v = v && typeof v === 'object' ? v : {};
  const limits = {};
  if (v.limits && typeof v.limits === 'object') {
    for (const [k, l] of Object.entries(v.limits)) {
      if (!l || typeof l !== 'object') continue;
      limits[k] = {
        count: l.count === undefined ? DEFAULT_COUNT : clampCount(l.count),
        pins: Array.isArray(l.pins) ? l.pins.filter((p) => typeof p === 'string') : [],
        all: l.all === true,
      };
    }
  }
  return { folded: v.folded && typeof v.folded === 'object' ? v.folded : {}, query: typeof v.query === 'string' ? v.query : '', limits };
}
function load() {
  try { return normalizeState(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return normalizeState({}); }
}
function save(ls) {
  try { localStorage.setItem(KEY, JSON.stringify({ folded: ls.folded, query: ls.query, limits: ls.limits })); } catch (e) { /* works without storage */ }
}
function limitOf(ls, project) {
  return ls.limits[project] || (ls.limits[project] = { count: DEFAULT_COUNT, pins: [], all: false });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const keyOf = (s) => s.accountId + '|' + s.id;

function sessionRow(s, model, h, st, rerender, pin, depth) {
  const sel = st.selectedKey === keyOf(s);
  const b = el('button', 'srow' + (sel ? ' selected' : ''));
  b.type = 'button';
  if (sel) b.setAttribute('aria-current', 'true');
  const top = el('span', 'srow-top');
  if (model.nowMs - s.lastActiveMs < WORKING_MS || (model.runningKeys && model.runningKeys.has(keyOf(s)))) {
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
  const indent = (node) => {
    if (depth) { node.classList.add('srow-child'); node.style.marginLeft = depth * 16 + 'px'; }
    return node;
  };
  if (!pin) return indent(b);
  const wrap = el('div', 'srow-wrap');
  const pb = el('button', 'pin-btn' + (pin.on ? ' on' : ''), pin.on ? '\u2605' : '\u2606');
  pb.type = 'button';
  pb.setAttribute('aria-pressed', String(pin.on));
  pb.setAttribute('aria-label', (pin.on ? 'Unpin ' : 'Pin ') + s.title);
  pb.title = pin.on ? 'Unpin' : 'Pin';
  pb.addEventListener('click', () => pin.toggle());
  wrap.appendChild(b);
  wrap.appendChild(pb);
  if (h && h.onSendTo && s.id) {
    const sb = el('button', 'send-btn', 'Send to…');
    sb.type = 'button';
    sb.title = 'Send this conversation to another session';
    sb.setAttribute('aria-label', 'Send ' + s.title + ' to…');
    sb.setAttribute('aria-haspopup', 'menu');
    sb.addEventListener('click', () => h.onSendTo(sb, s));
    wrap.appendChild(sb);
  }
  return indent(wrap);
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
    if (!searching) {
      const lim = limitOf(ls, g.project);
      const ctl = el('span', 'count-ctl');
      ctl.setAttribute('role', 'group');
      ctl.setAttribute('aria-label', 'Sessions shown for ' + g.project);
      const step = (d) => { lim.count = clampCount(lim.count + d); save(ls); rerender(); };
      const mk = (t, label, d) => { const b = el('button', 'count-btn', t); b.type = 'button'; b.setAttribute('aria-label', label + ' for ' + g.project); b.disabled = d < 0 ? lim.count <= 1 : lim.count >= 20; b.addEventListener('click', () => step(d)); return b; };
      ctl.appendChild(mk('\u2212', 'Show fewer sessions', -1));
      const val = el('span', 'count-val', String(lim.count));
      val.setAttribute('aria-live', 'polite');
      ctl.appendChild(val);
      ctl.appendChild(mk('+', 'Show more sessions', 1));
      head.appendChild(ctl);
    }
    if (model.kind === 'desktop' && h && h.onNewSession) {
      const nb = el('button', 'btn small', 'New session');
      nb.type = 'button';
      nb.addEventListener('click', () => h.onNewSession(g.project, (g.sessions[0] && g.sessions[0].cwd) || ''));
      head.appendChild(nb);
    }
    if (h && h.onOpenProject) {
      const pb = el('button', 'btn small', 'Tile');
      pb.type = 'button';
      pb.title = 'Open ' + g.project + ' as its own tile';
      pb.setAttribute('aria-label', 'Open ' + g.project + ' as its own tile');
      pb.addEventListener('click', () => h.onOpenProject(g.project));
      head.appendChild(pb);
    }
    if (h && h.onOpenVisuals) {
      const vb = el('button', 'btn small vz-btn', 'Visuals');
      vb.type = 'button';
      const fresh = !!(h.visualsNew && h.visualsNew(g.project));
      vb.title = 'Pictures, pages and files from ' + g.project;
      vb.setAttribute('aria-label', 'Open Visuals for ' + g.project + (fresh ? ' (new)' : ''));
      if (fresh) {
        const dot = el('span', 'vz-dot');
        dot.setAttribute('aria-hidden', 'true');
        vb.appendChild(dot);
      }
      vb.addEventListener('click', () => h.onOpenVisuals(g.project));
      head.appendChild(vb);
    }
    if (h && h.onProjectMenu) {
      const mb = el('button', 'btn small proj-menu-btn', '⋯');
      mb.type = 'button';
      mb.title = 'Menu for ' + g.project;
      mb.setAttribute('aria-label', 'Menu for ' + g.project);
      mb.setAttribute('aria-haspopup', 'menu');
      mb.addEventListener('click', () => h.onProjectMenu(mb, g.project, (g.sessions[0] && g.sessions[0].cwd) || ''));
      head.appendChild(mb);
    }
    sec.appendChild(head);
    if (open) {
      const lim = limitOf(ls, g.project);
      const all = searching || lim.all;
      const { shown, hiddenCount } = all ? { shown: g.sessions, hiddenCount: 0 } : limitSessions(g.sessions, lim.count, lim.pins);
      for (const { s, depth } of nestSessions(shown, model.parents)) {
        const on = lim.pins.includes(s.id);
        sec.appendChild(sessionRow(s, model, h, st, rerender, {
          on,
          toggle: () => { lim.pins = on ? lim.pins.filter((p) => p !== s.id) : lim.pins.concat(s.id); save(ls); rerender(); },
        }, depth));
      }
      if (!searching && (hiddenCount > 0 || (lim.all && g.sessions.length > 1))) {
        const more = el('button', 'show-all', lim.all ? 'Show fewer' : 'Show all ' + g.sessions.length);
        more.type = 'button';
        more.setAttribute('aria-expanded', String(lim.all));
        more.addEventListener('click', () => { lim.all = !lim.all; save(ls); rerender(); });
        sec.appendChild(more);
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
