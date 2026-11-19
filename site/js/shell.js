// The calm shell (app only): the session list on the left and one to four session panes side by side. It replaces the dockview grid.
// The open panes, their Terminal or Visual pick and the last pick are saved through layoutSet and put back on start (nothing is started).
import { renderSessionList, keyOf } from './sessionlist.js';
import { createPane } from './pane.js';
import { openMenu } from './menu.js';
import { accountColor, badgeText, filterSummary, loadFilter, saveFilter } from './accounts.js';
import { loadSettings, saveSettings, needsYouList, addedKeys, notificationText, openQuestionOf, questionText } from './calm.js';
import { permissionText } from './visualcards.js';
import { localCopyOf } from './cloudlist.js';
import { sessionTileKey } from './tiles/session.js';
import {
  emptyLayout, parseLayout, openBeside, openHere, closePane, setMode, setParams, paneId, MAX_PANES,
} from './panes.js';

const FULL = 'Four sessions are open. Close one first.';
const WAIT_POLL_MS = 1500;
const msg = (e) => (e && e.message ? e.message : String(e));

// env = { source, panels, notice, refresh, onReporter, getModel(), getHandlers(), getSendTo(), getAsk(), listBody, panesEl, search }
export async function createShell(env) {
  let model = env.getModel();
  let layout = emptyLayout();
  let ready = false; // saving before the saved layout was read would overwrite it
  let saveTimer = null;
  let nextNew = 1;
  const panes = new Map(); // pane id -> pane component
  const autoStart = new Set(); // new-session ids that start Claude at once
  let waiting = new Set();
  let calm = loadSettings();
  let openItems = []; // waiting panes: { key, project, accountId, kind, text }
  const closedQ = new Map(); // key -> { stamp, item|null } for sessions with no pane
  const firstSeen = new Map(); // key -> when it started waiting
  let needs = [];
  let needsSig = '';
  let baselined = false; // what already waited when the app started does not notify
  const applyMotion = () => document.body.classList.toggle('reduce-motion', calm.reduceMotion);
  applyMotion();
  const listState = { query: '', earlierCount: 5, selectedKeys: new Set(), accountId: null };
  let filterLoaded = false;

  const tileEnv = {
    source: env.source, panels: env.panels, notice: env.notice, onReporter: env.onReporter, refresh: env.refresh,
    getModel: () => model, calm: () => calm,
  };

  // ----- saving and putting back -----
  const snapshot = () => (ready ? { version: 1, current: layout, saved: [] } : null);
  async function persist() {
    const data = snapshot();
    if (!data) return;
    try { await env.source.layoutSet(data); } catch (e) { env.notice('Could not save the open sessions: ' + msg(e)); }
  }
  function scheduleSave() {
    if (!ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }

  // ----- keeping the page equal to the layout -----
  function apply(next) {
    layout = next;
    sync();
    scheduleSave();
  }

  function sync() {
    for (const [id, p] of panes) if (!layout.panes.some((x) => x.id === id)) { p.dispose(); panes.delete(id); }
    for (const pane of layout.panes) {
      if (panes.has(pane.id)) continue;
      const id = pane.id;
      panes.set(id, createPane(env.panesEl, pane, {
        tileEnv, getSendTo: () => (env.getSendTo ? env.getSendTo() : null), getAsk: () => (env.getAsk ? env.getAsk() : null),
        startNow: autoStart.delete(id), ptyId: null, sessionTiles,
        cloud: {
          openExternal: (url) => env.source.openExternal(url),
          localCopy: (repoName) => localCopyOf(model.groups, repoName),
          continueHere: (p, copy) => {
            addNew({ kind: 'session', accountId: p.accountId, sessionId: null, teleport: p.cloudId, cwd: copy.cwd, project: copy.project, title: 'Continue: ' + p.title });
          },
        },
        onMode: (m) => apply(setMode(layout, id, m)),
        onClose: () => apply(closePane(layout, id)),
        onParams: (patch) => { layout = setParams(layout, id, patch); scheduleSave(); },
        onFocus: () => { if (layout.active !== id) { layout = { ...layout, active: id }; markActive(); scheduleSave(); } },
      }));
    }
    // Move an element only when it is out of place: moving a terminal's element resets its focus.
    layout.panes.forEach((pane, i) => { if (env.panesEl.children[i] !== panes.get(pane.id).el) env.panesEl.insertBefore(panes.get(pane.id).el, env.panesEl.children[i] || null); });
    env.panesEl.dataset.count = String(layout.panes.length);
    env.panesEl.classList.toggle('empty', layout.panes.length === 0);
    markActive();
    redraw();
  }
  function markActive() {
    for (const [id, p] of panes) p.setActive(id === layout.active && layout.panes.length > 1);
  }

  // The filter line above the list: what the list covers; a click picks All accounts or one account (remembered; a gone account falls back to All).
  function drawFilter() {
    const btn = env.filterEl;
    if (!btn) return;
    const accounts = model.accounts || [];
    if (!filterLoaded && accounts.length) { listState.accountId = loadFilter(accounts); filterLoaded = true; }
    if (listState.accountId && !accounts.some((a) => a.id === listState.accountId)) listState.accountId = null;
    const by = {};
    for (const g of model.groups || []) for (const s of g.sessions) by[s.accountId] = (by[s.accountId] || 0) + 1;
    btn.textContent = filterSummary(accounts, by, listState.accountId).text;
    btn.style.background = listState.accountId ? accountColor(accounts, listState.accountId) : '';
    btn.style.color = listState.accountId ? '#fff' : '';
  }
  if (env.filterEl) env.filterEl.addEventListener('click', () => {
    const accounts = model.accounts || [];
    const pick = (id) => { listState.accountId = id; saveFilter(id); drawList(); };
    openMenu(env.filterEl, [{ label: 'All accounts', checked: !listState.accountId, run: () => pick(null) },
      ...accounts.map((a) => ({ label: badgeText(a), detail: a.email || a.name, checked: listState.accountId === a.id, run: () => pick(a.id) }))], { label: 'Show sessions from' });
  });

  function drawList() {
    drawFilter();
    listState.selectedKeys = new Set(layout.panes.map((p) => p.id));
    renderSessionList(env.listBody, { ...model, waitingKeys: waiting, needs }, { onOpen: (s) => openSession(s), onOpenBeside: (s) => openSessionBeside(s), onNeedsOpen: (n) => openNeeds(n.key) }, listState);
  }

  let pressed = false;
  let pendingUpdate = false;
  function redraw() {
    pendingUpdate = false;
    drawList();
    for (const p of panes.values()) p.update(model);
  }
  document.addEventListener('mousedown', () => { pressed = true; }, true);
  document.addEventListener('mouseup', () => { pressed = false; if (pendingUpdate) setTimeout(redraw, 0); }, true);

  // ----- opening -----
  const paramsOf = (s) => (s.cloud ? {
    kind: 'cloud', accountId: s.accountId, cloudId: s.id, title: s.title, repo: s.repo, status: s.status, url: s.url,
  } : {
    kind: 'session', accountId: s.accountId, sessionId: s.id, projectDir: s.projectDir, file: s.file,
    cwd: s.cwd, project: s.project, title: s.title, gitBranch: s.gitBranch || '',
  });
  function openSession(s) { apply(openHere(layout, paramsOf(s))); }
  function openSessionBeside(s) {
    const next = openBeside(layout, paramsOf(s));
    if (!next) return env.notice(FULL);
    apply(next);
  }
  function addNew(params) {
    params.key = 'new:' + Date.now().toString(36) + '-' + nextNew++;
    const next = openBeside(layout, params);
    if (!next) throw new Error(FULL);
    autoStart.add(params.key);
    apply(next);
    return params.key;
  }
  function newSession(project, cwd, accountId) {
    return addNew({ kind: 'session', accountId, sessionId: null, cwd, project, title: 'New session in ' + project });
  }
  // A sub-session: a new pane that runs `claude --resume <parent> --fork-session` on the same account.
  function forkSession(parent) {
    return addNew({ kind: 'session', accountId: parent.accountId, sessionId: null, forkOf: parent.id, cwd: parent.cwd, project: parent.project, title: 'Sub-session of ' + parent.title });
  }

  // A Needs-you click (or a notification click): open that session, as Visual, with its focus card.
  function openNeeds(key) {
    const s = (model.groups || []).flatMap((g) => g.sessions).find((x) => keyOf(x) === key);
    if (!s) return env.notice('That session is not in the list any more.');
    openSession(s);
    const p = panes.get(paneId(paramsOf(s)));
    if (p) p.showFocus();
  }
  if (env.source.onNotifyClick) env.source.onNotifyClick((key) => openNeeds(key));

  // ----- Needs you: open panes from the drawn screen, closed sessions from their transcript's last open question -----
  const CLOSED_WINDOW_MS = 2 * 3600 * 1000;
  function rebuildNeeds() {
    const now = Date.now();
    const items = [...openItems, ...[...closedQ.values()].map((c) => c.item).filter(Boolean)].map((i) => ({ ...i, atMs: firstSeen.get(i.key) || now }));
    const keys = new Set(items.map((i) => i.key));
    for (const k of [...firstSeen.keys()]) if (!keys.has(k)) firstSeen.delete(k);
    for (const i of items) if (!firstSeen.has(i.key)) firstSeen.set(i.key, now);
    const prev = new Set(needs.map((i) => i.key));
    const next = needsYouList(items.map((i) => ({ ...i, atMs: firstSeen.get(i.key) })));
    needs = next;
    if (calm.switches.notify && env.source.notify) {
      for (const i of addedKeys(prev, next)) {
        if (!baselined && !openItems.some((o) => o.key === i.key)) continue;
        Promise.resolve(env.source.notify(notificationText(i), i.key)).catch((e) => console.error('could not show the notification:', e));
      }
    }
    const sig = next.map((i) => i.key + i.what).join('\n');
    if (sig !== needsSig) { needsSig = sig; drawList(); }
  }
  let scanning = false;
  async function scanClosed() {
    if (scanning) return;
    scanning = true;
    try {
      const open = new Set(layout.panes.map((p) => p.id));
      const now = Date.now();
      for (const s of (model.groups || []).flatMap((g) => g.sessions)) {
        if (s.cloud) continue; // no transcript on this PC
        const k = keyOf(s);
        if (open.has(k) || now - s.lastActiveMs > CLOSED_WINDOW_MS) { closedQ.delete(k); continue; }
        const c = closedQ.get(k);
        if (c && c.stamp === s.lastActiveMs) continue;
        let item = null;
        try {
          const q = openQuestionOf((await env.source.readSessionText(s.accountId, s.projectDir, s.file)).text);
          if (q) item = { key: k, project: s.project, accountId: s.accountId, kind: 'question', text: questionText(q) };
        } catch (e) { console.error('could not read a session for Needs you:', e); }
        closedQ.set(k, { stamp: s.lastActiveMs, item });
      }
      rebuildNeeds();
      // After the first scan that saw sessions (the first update can arrive before any are listed), so what already waited at start does not notify.
      if ((model.groups || []).some((g) => g.sessions.length)) baselined = true;
    } finally { scanning = false; }
  }

  // For Send to: the session panes, whether or not their process runs.
  function sessionTiles() {
    return [...panes].filter(([, p]) => !p.cloud).map(([id, p]) => ({ id, ...p.tile.info() }));
  }
  // Types text into a session pane (starting it first if needed, then waiting for quiet output) and shows the pane.
  async function deliver(id, text) {
    const p = panes.get(id);
    if (!p || !p.tile.ensureRunning) throw new Error('That session is not open any more.');
    await p.tile.ensureRunning();
    const key = p.tile.info().key;
    const quiet = await env.panels.whenQuiet(key, 1500, 20000);
    const ok = await env.panels.write(key, text);
    if (!ok) throw new Error('Claude Code is not running in that session, so nothing was typed.');
    layout = { ...layout, active: id };
    markActive();
    return { quiet };
  }

  // ----- dragging a session from the list onto the panes -----
  const TYPE = 'application/x-router-session';
  env.panesEl.addEventListener('dragover', (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes(TYPE)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
  env.panesEl.addEventListener('drop', (ev) => {
    const raw = ev.dataTransfer && ev.dataTransfer.getData(TYPE);
    if (!raw) return;
    ev.preventDefault();
    try {
      const d = JSON.parse(raw);
      const s = (model.groups || []).flatMap((g) => g.sessions).find((x) => x.accountId === d.accountId && x.id === d.id);
      if (s) openSessionBeside(s);
    } catch (e) { env.notice('Could not open the dropped session: ' + msg(e)); }
  });

  env.search.addEventListener('input', () => { listState.query = env.search.value; drawList(); });

  // ----- the orange dot: which running terminals show a selector -----
  let polling = false;
  async function pollWaiting() {
    if (polling || !env.source.screenWaiting) return;
    polling = true;
    try {
      const next = new Set();
      const items = [];
      for (const [id, p] of panes) {
        if (p.cloud) continue;
        const info = p.tile.info();
        if (!env.panels.isRunning(info.key)) continue;
        const lines = env.panels.screenLines(info.key);
        const kind = lines.length ? await env.source.screenWaiting(lines) : null;
        if (!kind) continue;
        next.add(id);
        items.push({ key: id, project: info.project, accountId: info.accountId, kind, text: (kind === 'question' && p.viz.questionText()) || permissionText(lines) });
      }
      openItems = items;
      const changed = [...next].sort().join('\n') !== [...waiting].sort().join('\n');
      waiting = next;
      rebuildNeeds();
      if (changed) drawList();
    } catch (e) {
      console.error('could not read whether a session waits:', e);
    } finally { polling = false; }
  }
  setInterval(pollWaiting, WAIT_POLL_MS);

  // ----- start: put the saved panes back, without starting anything -----
  try {
    const file = await env.source.layoutGet();
    layout = parseLayout(file && file.current);
  } catch (e) {
    env.notice('Could not read the saved sessions: ' + msg(e));
  }
  ready = true;
  sync();
  window.routerGridSnapshot = snapshot; // main asks for this on quit

  return {
    // The list and panes redraw on each refresh; a redraw while the mouse is down would swallow the click, so it waits for mouse up.
    update(m) {
      model = m;
      scanClosed().catch((e) => console.error('Needs you scan failed:', e));
      if (pressed) { pendingUpdate = true; return; }
      redraw();
    },
    openSession, openBeside: openSessionBeside, newSession, forkSession, sessionTiles, deliver,
    calm: () => calm,
    setCalm(next) { calm = next; saveSettings(calm); applyMotion(); for (const p of panes.values()) p.viz.restyle(); },
    layout: () => layout,
    snapshot,
  };
}
