// Terminal panels (Windows app only): one xterm.js Terminal per running Claude Code process, kept per session.
// Pure helpers are exported for tests; the DOM and the desktop bridge are touched only inside createPanels().
export const STOPPED_TEXT = 'Claude Code has stopped. Resume here to start it again.';

// Key of a panel: accountId|sessionId (the same key the list uses), or new:<n> for a session that has no id yet.
export function panelKey(accountId, sessionId) { return accountId + '|' + sessionId; }
export function newPanelKey(n) { return 'new:' + n; }

// Pure: what to write after a kept-output snapshot { end } was written. chunks are [{ data, end }] that arrived meanwhile;
// those the snapshot already holds are dropped and a half-covered one is cut.
export function liveAfterSnapshot(chunks, snapEnd) {
  const out = [];
  for (const c of chunks) {
    if (c.end == null) { out.push(c.data); continue; }
    const start = c.end - c.data.length;
    if (c.end <= snapEnd) continue;
    out.push(start < snapEnd ? c.data.slice(snapEnd - start) : c.data);
  }
  return out;
}

// Which panel should be on screen: the one for the selected key, if there is one; otherwise none.
export function panelToShow(selectedKey, keys) {
  return selectedKey != null && [...keys].includes(selectedKey) ? selectedKey : null;
}

const VENDOR = 'vendor/xterm/';
let loading = null;
function loadVendor() {
  if (loading) return loading;
  const addScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load ' + src + ' (run npm install in the desktop folder).'));
    document.head.appendChild(s);
  });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = VENDOR + 'xterm.css';
  document.head.appendChild(css);
  loading = addScript(VENDOR + 'xterm.js').then(() => addScript(VENDOR + 'addon-fit.js'));
  loading.catch(() => { loading = null; });
  return loading;
}

export function createPanels(bridge, onChange) {
  const entries = new Map(); // key -> { key, el, term, fit, ptyId, running, title }
  const byPty = new Map(); // ptyId -> entry
  const pending = new Map(); // ptyId -> [{ data, end }] that arrived before ptyOpen answered or the tile attached
  let nextNew = 1;
  const changed = () => { if (onChange) onChange(); };

  bridge.onPtyData(({ ptyId, data, end }) => {
    const e = byPty.get(ptyId);
    if (e) e.lastDataAt = Date.now();
    if (e && e.hold) e.hold.push({ data, end });
    else if (e) e.term.write(data);
    else pending.set(ptyId, [...(pending.get(ptyId) || []), { data, end }]);
  });
  bridge.onPtyExit(({ ptyId }) => {
    const e = byPty.get(ptyId);
    pending.delete(ptyId);
    if (!e) return;
    byPty.delete(ptyId);
    e.running = false;
    e.ptyId = null;
    e.term.write('\r\n\x1b[33m' + STOPPED_TEXT + '\x1b[0m\r\n');
    changed();
  });

  function fitNow(e) {
    if (!e.term || !e.el.isConnected || !e.el.offsetWidth) return;
    try { e.fit.fit(); } catch (err) { console.error('terminal fit failed:', err); return; }
    if (e.ptyId) bridge.ptyResize(e.ptyId, e.term.cols, e.term.rows).catch((err) => console.error('resize failed:', err));
  }
  window.addEventListener('resize', () => { for (const e of entries.values()) fitNow(e); });

  async function ensure(key, slot) {
    let e = entries.get(key);
    if (!e) {
      e = { key, el: document.createElement('div'), term: null, fit: null, ptyId: null, running: false, started: false, title: '' };
      e.el.className = 'term-panel';
      entries.set(key, e);
    }
    slot.hidden = false;
    slot.appendChild(e.el);
    if (!e.term) {
      await loadVendor();
      e.term = new window.Terminal({ fontSize: 14, cursorBlink: true });
      e.fit = new window.FitAddon.FitAddon();
      e.term.loadAddon(e.fit);
      e.term.open(e.el);
      e.term.onData((d) => { if (e.ptyId) bridge.ptyWrite(e.ptyId, d).catch((err) => console.error('write failed:', err)); });
    }
    return e;
  }

  async function start(e, o) {
    fitNow(e);
    const r = await bridge.ptyOpen({ sessionId: o.sessionId || null, cwd: o.cwd, accountId: o.accountId, title: o.title, cols: e.term.cols, rows: e.term.rows });
    if (!r || r.error) {
      e.term.write('\r\n' + ((r && r.error) || 'Claude Code could not be started.') + '\r\n');
      return;
    }
    e.ptyId = r.ptyId;
    e.running = true;
    byPty.set(r.ptyId, e);
    if (pending.has(r.ptyId)) { for (const c of pending.get(r.ptyId)) e.term.write(c.data); pending.delete(r.ptyId); }
    changed();
  }

  return {
    keys: () => [...entries.keys()],
    has: (key) => entries.has(key),
    isRunning: (key) => !!(entries.get(key) && entries.get(key).running),
    runningKeys: () => new Set([...entries.values()].filter((e) => e.running).map((e) => e.key)),
    newKey: () => newPanelKey(nextNew++),
    // Shows the panel for key in slot, starting its process unless it is already running.
    async show(key, slot, o) {
      const e = await ensure(key, slot);
      if (e.running) { fitNow(e); e.term.focus(); return; }
      if (e.started) e.term.reset();
      e.started = true;
      e.title = o.title || '';
      await start(e, o);
      e.term.focus();
    },
    // A tile moved here from another window: draws the output main kept for ptyId, then goes live.
    async attach(key, slot, o) {
      const e = await ensure(key, slot);
      e.title = o.title || '';
      e.started = true;
      e.ptyId = o.ptyId;
      e.running = true;
      e.hold = pending.get(o.ptyId) || [];
      pending.delete(o.ptyId);
      byPty.set(o.ptyId, e);
      try {
        const snap = await bridge.ptyBuffer(o.ptyId);
        if (snap) {
          e.term.write(snap.data);
          for (const d of liveAfterSnapshot(e.hold, snap.end)) e.term.write(d);
        } else {
          // The process ended before the tile arrived.
          byPty.delete(o.ptyId);
          e.running = false;
          e.ptyId = null;
          e.term.write('\r\n\x1b[33m' + STOPPED_TEXT + '\x1b[0m\r\n');
        }
      } finally {
        e.hold = null;
      }
      fitNow(e);
      changed();
      e.term.focus();
    },
    // When output last arrived for a panel (ms), or null; used to wait until a resumed session has gone quiet.
    lastOutputAt(key) { const e = entries.get(key); return e && e.lastDataAt ? e.lastDataAt : null; },
    focus(key) { const e = entries.get(key); if (e && e.term) e.term.focus(); },
    ptyIdOf(key) { const e = entries.get(key); return e && e.running ? e.ptyId : null; },
    // Lets go of a panel that moved to another window; the process keeps running in main.
    release(key) {
      const e = entries.get(key);
      if (!e) return;
      if (e.ptyId) byPty.delete(e.ptyId);
      if (e.term) e.term.dispose();
      e.el.remove();
      entries.delete(key);
      changed();
    },
    // Puts an existing panel back (without starting anything) after the view around it was rebuilt.
    async reattach(key, slot) {
      const e = entries.get(key);
      if (!e) return false;
      slot.hidden = false;
      slot.appendChild(e.el);
      if (e.term) { fitNow(e); e.term.refresh(0, e.term.rows - 1); }
      return true;
    },
    // Refits one panel to its slot (the grid calls this when a tile changes size).
    fit(key) { const e = entries.get(key); if (e) fitNow(e); },
    hide() {},
  };
}
