// Board renderer. Pure helpers are exported for tests; renderBoard builds DOM with textContent only.

export function relativeTime(thenMs, nowMs) {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}

// "resets 4:10pm" if the reset is on the same calendar day as now, else "resets Thu". Local time.
export function resetText(resetMs, nowMs) {
  if (resetMs == null) return '';
  const r = new Date(resetMs), n = new Date(nowMs);
  if (r.toDateString() === n.toDateString()) {
    let h = r.getHours();
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return 'resets ' + h + ':' + String(r.getMinutes()).padStart(2, '0') + ap;
  }
  return 'resets ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.getDay()];
}

export function barLevel(pct) {
  if (pct >= 90) return 'hot';
  if (pct >= 70) return 'warn';
  return 'ok';
}

// The browser cannot know a folder's full path, so for non-default folders on Windows it assumes the
// folder sits directly in the user folder (%USERPROFILE%\<folder name>).
export function resumeLine(session, accountName) {
  const base = 'cd "' + session.cwd + '" && claude --resume ' + session.id;
  if (!accountName || accountName === '.claude') return base;
  return 'set CLAUDE_CONFIG_DIR=%USERPROFILE%\\' + accountName + '&& ' + base;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label, onClick, cls) {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function bar(label, pct, resetsAt, nowMs, fallback) {
  const row = el('div', 'bar-row');
  row.appendChild(el('span', 'bar-label', label));
  if (pct == null) {
    row.appendChild(fallback || el('span', 'bar-val', 'no reading'));
    return row;
  }
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const rt = resetText(resetsAt, nowMs);
  row.appendChild(el('span', 'bar-val', p + '%' + (rt ? ' · ' + rt : '')));
  const track = el('div', 'track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuenow', String(p));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = el('div', 'fill ' + barLevel(p));
  fill.style.width = p + '%';
  track.appendChild(fill);
  row.appendChild(track);
  return row;
}

function card(s, color, model, h) {
  const acct = model.accounts.find((a) => a.id === s.accountId);
  const lim = (model.limitsByAccount && model.limitsByAccount[s.accountId]) || {};
  const c = el('article', 'card');
  c.style.setProperty('--stripe', color);
  c.appendChild(el('h3', '', s.title));
  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'tag', acct ? acct.name : ''));
  meta.appendChild(el('span', '', relativeTime(s.lastActiveMs, model.nowMs)));
  c.appendChild(meta);
  // Once tracking is on, the first reading only arrives after Claude Code's next reply in that account.
  const turnOn = () => (acct && acct.reporter === 'on')
    ? el('span', 'bar-val', "Waiting for Claude's next reply")
    : button('Turn on limit tracking', () => h.onReporter && h.onReporter(s.accountId, true));
  c.appendChild(bar('Context', s.contextPct, null, model.nowMs));
  c.appendChild(bar('5-hour limit', lim.fiveHourPct, lim.fiveHourResetsAt, model.nowMs, turnOn()));
  c.appendChild(bar('Weekly limit', lim.weeklyPct, lim.weeklyResetsAt, model.nowMs, turnOn()));
  const acts = el('div', 'card-actions');
  acts.appendChild(button('Copy resume line', () => h.onCopyResume && h.onCopyResume(s)));
  if (model.kind === 'desktop' && h.onResume) acts.appendChild(button('Resume', () => h.onResume(s)));
  c.appendChild(acts);
  return c;
}

function draw(root, model, h) {
  root.textContent = '';
  const strips = model.accounts.filter((a) => a.needsPermission);
  if (strips.length) {
    const wrap = el('div', 'perm-strip');
    for (const a of strips) wrap.appendChild(button('Allow access to ' + a.name, () => h.onGrant && h.onGrant(a.id), 'primary'));
    root.appendChild(wrap);
  }
  const cols = el('div', 'columns');
  for (const g of model.groups) {
    const col = el('section', 'col');
    col.style.setProperty('--stripe', g.color);
    const head = el('div', 'col-head');
    head.appendChild(el('h2', '', g.project));
    col.appendChild(head);
    if (model.kind === 'desktop' && h.onNewSession) {
      const cwd = (g.sessions[0] && g.sessions[0].cwd) || '';
      col.appendChild(button('New session here', () => h.onNewSession(g.project, cwd)));
    }
    for (const s of g.sessions) col.appendChild(card(s, g.color, model, h));
    cols.appendChild(col);
  }
  root.appendChild(cols);
}

export function layoutKey(model) {
  const perm = model.accounts.filter((a) => a.needsPermission).map((a) => a.id).join(',');
  return perm + '|' + model.groups.map((g) => g.project + ':' + g.sessions.map((x) => x.accountId + '/' + x.id).join(',')).join(';');
}

// Layout stays still while the pointer is over the board: the new model is held and drawn on pointerleave.
// opts.force redraws at once (used after the user's own action and on first draw).
export function renderBoard(root, model, handlers, opts) {
  let st = root._boardState;
  if (!st) {
    st = root._boardState = { pending: null };
    root.addEventListener('pointerleave', () => {
      if (st.pending) { const p = st.pending; st.pending = null; st.layout = layoutKey(p.model); draw(root, p.model, p.handlers); }
    });
  }
  // Only a change in order is held back; new numbers in the same layout are drawn straight away.
  const layout = layoutKey(model);
  const hovering = root.matches(':hover') && root.childElementCount > 0;
  if (hovering && layout !== st.layout && !(opts && opts.force)) { st.pending = { model, handlers }; return false; }
  st.pending = null;
  st.layout = layout;
  draw(root, model, handlers);
  return true;
}
