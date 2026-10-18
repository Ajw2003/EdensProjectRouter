// The Visuals tile: one per project. A strip of what its sessions wrote or showed, and a viewer for the one picked.
// Pictures and video load from router-file://, PDF in Chromium's viewer, Markdown through marked into a sandboxed iframe, web pages
// and claude.ai artifacts in a <webview>. DOM built with textContent only (the Markdown document goes in a sandboxed srcdoc).
import { el, button } from '../sessionview.js';
import { relativeTime } from '../board.js';
import { mergeVisuals, routerFileUrl } from '../visualsfind.js';
import { renderMarkdownDoc } from '../markdownview.js';
import { sessionForPage, textToType, waitQuiet, confirmation, QUIET_CAP_MS } from '../sendreply.js';
import { menuButton } from '../menu.js';
import { panelKey } from '../terminal.js';

export const REFRESH_MS = 3000;
const SEEN_KEY = 'router.visualsSeen';

// ---------- seen / new (pure parts exported for tests) ----------
export function newestAt(entries) {
  return (entries || []).reduce((m, e) => Math.max(m, e.at || 0), 0);
}
// A dot is shown when the project has entries newer than the last time its tile was viewed (never viewed counts as 0).
export function hasNewVisuals(newestMs, seenMs) {
  return newestMs > 0 && newestMs > (seenMs || 0);
}
function loadSeen() {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
export function seenAt(project) { return Number(loadSeen()[project]) || 0; }
export function markSeen(project, ms) {
  const v = loadSeen();
  v[project] = ms;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) { /* works without storage */ }
}

// The sessions of one project, grouped by account: [{ accountId, project: { name, sessions } }]
export function sessionsByAccount(model, project) {
  const g = (model.groups || []).find((x) => x.project === project);
  const by = new Map();
  for (const s of g ? g.sessions : []) {
    if (!by.has(s.accountId)) by.set(s.accountId, []);
    by.get(s.accountId).push({ id: s.id, projectDir: s.projectDir, file: s.file, cwd: s.cwd });
  }
  return [...by].map(([accountId, sessions]) => ({ accountId, project: { name: project, sessions } }));
}

// Lists the visuals of a project over all accounts: { entries (with accountId), problems }.
export async function loadProjectVisuals(source, model, project) {
  const lists = [];
  const problems = [];
  for (const a of sessionsByAccount(model, project)) {
    try {
      const r = await source.listVisuals(a.accountId, a.project);
      lists.push(r.entries.map((e) => ({ ...e, accountId: a.accountId })));
      problems.push(...(r.problems || []));
    } catch (e) {
      problems.push('Could not list pictures and pages for ' + a.accountId + ': ' + (e && e.message ? e.message : e));
    }
  }
  return { entries: mergeVisuals(...lists), problems };
}

// Background check for the dot on project rows. Every intervalMs it asks for each project's newest entry; onChange() when a dot may differ.
export function createVisualsWatcher(source, getModel, onChange, intervalMs) {
  const newest = {};
  let busy = false;
  let stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const model = getModel();
      let changed = false;
      for (const g of model.groups || []) {
        const r = await loadProjectVisuals(source, model, g.project);
        const n = newestAt(r.entries);
        if (newest[g.project] !== n) { newest[g.project] = n; changed = true; }
      }
      if (changed) onChange();
    } catch (e) {
      console.error('visuals check failed:', e);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(tick, intervalMs || 15000);
  setTimeout(tick, 2000);
  return {
    hasNew: (project) => hasNewVisuals(newest[project] || 0, seenAt(project)),
    note(project, ms) { newest[project] = ms; },
    // The tile is being looked at: remember when, and redraw the list if its dot just went away.
    seen(project, ms) {
      const had = hasNewVisuals(newest[project] || 0, seenAt(project));
      markSeen(project, ms);
      if (had) onChange();
    },
    stop() { stopped = true; clearInterval(timer); },
  };
}

let markedLoading = null;
function loadMarked() {
  if (window.marked) return Promise.resolve(window.marked);
  if (markedLoading) return markedLoading;
  markedLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/marked/marked.umd.js';
    s.onload = () => (window.marked ? res(window.marked) : rej(new Error('The Markdown library did not load.')));
    s.onerror = () => rej(new Error('Could not load vendor/marked/marked.umd.js (run npm install in the desktop folder).'));
    document.head.appendChild(s);
  });
  markedLoading.catch(() => { markedLoading = null; });
  return markedLoading;
}

const KIND_LABEL = { image: 'Picture', video: 'Video', pdf: 'PDF', markdown: 'Markdown', html: 'Web page', artifact: 'Claude artifact' };

// env = { source, notice, getModel(), watcher }
export function createVisualsTile(element, params, api, env) {
  const project = params.project;
  element.classList.add('vz');
  const head = el('header', 'vz-head');
  const tools = el('div', 'vz-tools');
  const stripEl = el('div', 'vz-strip');
  stripEl.setAttribute('role', 'list');
  stripEl.setAttribute('aria-label', 'Pictures and pages for ' + project);
  const status = el('p', 'vz-status');
  status.setAttribute('role', 'status');
  const viewer = el('div', 'vz-viewer');
  const foot = el('footer', 'vz-foot');
  head.append(el('h3', 'vz-title', 'Visuals · ' + project), tools);
  const bar = el('div', 'vz-send'); // "Send to <session>" for text the page copied
  bar.hidden = true;
  element.append(head, stripEl, status, bar, viewer, foot);

  let entries = [];
  let selectedPath = null;
  let shownKey = '';
  let toolState = new Map(); // account id -> 'on' | 'off'
  let stopped = false;
  let busy = false;
  let listSig = '';

  const msg = (e) => (e && e.message ? e.message : String(e));
  const selected = () => entries.find((e) => e.path === selectedPath) || null;

  // ----- Show tool buttons -----
  async function loadToolStates() {
    const accts = (env.getModel().accounts || []).filter((a) => !a.needsPermission);
    const next = new Map();
    for (const a of accts) {
      try { next.set(a.id, await env.source.showToolState(a.id)); } catch (e) { env.notice('Could not check the Show tool for ' + a.name + ': ' + msg(e)); }
    }
    toolState = next;
    drawTools();
  }
  function drawTools() {
    tools.textContent = '';
    for (const a of env.getModel().accounts || []) {
      if (!toolState.has(a.id)) continue;
      const on = toolState.get(a.id) === 'on';
      const b = button((on ? 'Turn off Show tool' : 'Turn on Show tool') + ' (' + a.name + ')', async () => {
        b.disabled = true;
        try {
          await env.source.setShowTool(a.id, !on);
          env.notice((on ? 'Show tool turned off for ' : 'Show tool turned on for ') + a.name + '. New Claude sessions pick it up.');
        } catch (e) {
          env.notice('Could not change the Show tool for ' + a.name + ': ' + msg(e));
        }
        await loadToolStates();
      }, 'small');
      b.title = on ? 'Stop offering the show tool to Claude in this account' : 'Let Claude put a file on screen here with the show tool';
      tools.appendChild(b);
    }
  }

  // ----- strip -----
  function drawStrip() {
    stripEl.textContent = '';
    if (!entries.length) {
      stripEl.appendChild(el('p', 'vz-empty', 'Nothing to show yet. Pictures, Markdown and web pages that Claude writes in this project appear here.'));
      return;
    }
    const now = Date.now();
    for (const e of entries) {
      const b = el('button', 'vz-item' + (e.path === selectedPath ? ' selected' : ''));
      b.type = 'button';
      b.setAttribute('role', 'listitem');
      if (e.path === selectedPath) b.setAttribute('aria-current', 'true');
      b.title = e.path;
      b.appendChild(el('span', 'vz-name', e.name));
      b.appendChild(el('span', 'vz-kind', KIND_LABEL[e.kind] || e.kind));
      b.appendChild(el('span', 'vz-time', e.at ? relativeTime(e.at, now) : ''));
      b.addEventListener('click', () => { selectedPath = e.path; drawStrip(); drawViewer(); });
      stripEl.appendChild(b);
    }
  }

  // ----- send a page's copied reply to its session -----
  let copied = '';
  let barMsg = '';
  let sending = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const allSessions = () => (env.getModel().groups || []).flatMap((g) => g.sessions);
  function clearBar() { copied = ''; barMsg = ''; bar.hidden = true; bar.textContent = ''; }
  function onCopied(text) {
    if (!textToType(text)) return;
    copied = text;
    barMsg = '';
    drawBar();
  }
  function drawBar() {
    bar.textContent = '';
    bar.hidden = !copied && !barMsg;
    if (bar.hidden) return;
    const dismiss = button('Dismiss', clearBar, 'small');
    dismiss.setAttribute('aria-label', 'Dismiss the Send to bar');
    if (barMsg) {
      const m = el('span', 'vz-send-msg', barMsg);
      m.setAttribute('role', 'status');
      bar.append(m, dismiss);
      return;
    }
    const target = sessionForPage(selected(), allSessions());
    if (target) {
      const b = button('Send to ' + target.title, () => sendTo(target), 'small primary');
      b.disabled = sending;
      b.title = 'Type what the page copied into this session, without pressing Enter';
      bar.appendChild(b);
    } else {
      const items = () => {
        const open = env.sessionTiles ? env.sessionTiles() : [];
        return open.length ? open.map((s) => ({ label: s.title, detail: s.project, run: () => sendTo(s) })) : [{ label: 'No session tiles are open', run: () => {} }];
      };
      bar.appendChild(menuButton('btn small primary', 'Send to…', items, { label: 'Send to… pick an open session' }));
    }
    bar.appendChild(dismiss);
  }
  function setBarMsg(text) { barMsg = text; drawBar(); }
  // Types the copied text into session s (no Enter). Starts the session first if no process runs for it.
  async function sendTo(s) {
    if (sending) return;
    const text = textToType(copied);
    if (!text) return env.notice('There is nothing to send.');
    sending = true;
    const key = panelKey(s.accountId, s.id);
    try {
      let ptyId = env.panels.ptyIdOf(key);
      let here = !!ptyId;
      if (!ptyId) { // maybe running in another window: main owns every process
        const p = (await env.source.ptyList()).find((x) => x.sessionId === s.id);
        ptyId = p ? p.ptyId : null;
      }
      if (!ptyId) {
        setBarMsg('Starting ' + s.title + '…');
        env.startSession(s);
        for (let t0 = Date.now(); !env.panels.ptyIdOf(key) && Date.now() - t0 < QUIET_CAP_MS; ) await sleep(100);
        ptyId = env.panels.ptyIdOf(key);
        if (!ptyId) throw new Error('Claude Code did not start in ' + QUIET_CAP_MS / 1000 + ' seconds.');
        here = true;
        await waitQuiet(() => env.panels.lastOutputAt(key), { now: Date.now, sleep });
        ptyId = env.panels.ptyIdOf(key) || ptyId;
      }
      await env.source.ptyWrite(ptyId, text);
      if (here) { env.focusSession(s); env.panels.focus(key); }
      copied = '';
      setBarMsg(confirmation(s.title) + (here ? '' : ' (It is in another window.)'));
    } catch (e) {
      barMsg = '';
      drawBar();
      env.notice('Could not send to ' + s.title + ': ' + msg(e));
    } finally {
      sending = false;
    }
  }

  // ----- viewer -----
  function note(text) {
    viewer.textContent = '';
    viewer.appendChild(el('p', 'vz-note', text));
  }
  async function drawViewer() {
    const e = selected();
    const key = e ? e.path + '|' + e.at : '';
    if (key === shownKey) return;
    shownKey = key;
    clearBar();
    viewer.textContent = '';
    drawFoot();
    if (!e) return note('Pick something from the strip above.');
    const url = e.kind === 'artifact' ? e.path : routerFileUrl(e.path, e.at);
    if (e.kind !== 'artifact' && e.inProject === false) {
      return note('This file is outside the project folder, so it can’t be shown here. Use Open in browser.');
    }
    try {
      if (e.kind === 'image') {
        const img = el('img', 'vz-img');
        img.alt = e.name;
        img.src = url;
        img.addEventListener('error', () => note('The picture could not be loaded.'));
        viewer.appendChild(img);
      } else if (e.kind === 'video') {
        const v = el('video', 'vz-video');
        v.controls = true;
        v.src = url;
        v.setAttribute('aria-label', e.name);
        viewer.appendChild(v);
      } else if (e.kind === 'pdf') {
        const f = el('iframe', 'vz-frame');
        f.title = e.name;
        f.src = url;
        viewer.appendChild(f);
      } else if (e.kind === 'markdown') {
        const [text, marked] = await Promise.all([env.source.readVisualText(e.path), loadMarked()]);
        if (stopped || shownKey !== key) return;
        const f = el('iframe', 'vz-frame vz-md');
        f.title = e.name;
        f.setAttribute('sandbox', ''); // no scripts, no forms, no links out
        f.srcdoc = renderMarkdownDoc(marked, text);
        viewer.appendChild(f);
      } else if (e.kind === 'html') {
        const w = document.createElement('webview');
        w.className = 'vz-webview';
        w.setAttribute('partition', 'router-pages');
        w.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
        w.setAttribute('title', e.name);
        w.setAttribute('src', url);
        w.addEventListener('ipc-message', (ev) => { if (ev.channel === 'router:copied' && typeof ev.args[0] === 'string') onCopied(ev.args[0]); });
        viewer.appendChild(w);
      } else if (e.kind === 'artifact') {
        const w = document.createElement('webview');
        w.className = 'vz-webview';
        w.setAttribute('partition', 'persist:claude-' + (e.accountId || 'default'));
        w.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
        w.setAttribute('title', 'Claude artifact');
        w.setAttribute('src', url);
        viewer.appendChild(w);
      }
    } catch (err) {
      note('Could not show ' + e.name + ': ' + msg(err));
    }
  }

  function drawFoot() {
    foot.textContent = '';
    const e = selected();
    const open = button('Open in browser', () => {
      const s = selected();
      if (s) Promise.resolve(env.source.openVisualFile(s.path)).catch((x) => env.notice('Could not open it: ' + msg(x)));
    }, 'small');
    const folder = button('Show in folder', () => {
      const s = selected();
      if (s) Promise.resolve(env.source.showVisualInFolder(s.path)).catch((x) => env.notice('Could not show it in its folder: ' + msg(x)));
    }, 'small');
    open.disabled = !e;
    folder.disabled = !e || e.kind === 'artifact';
    foot.append(open, folder);
    if (e && e.caption) foot.appendChild(el('span', 'vz-caption', e.caption));
  }

  // ----- refresh -----
  async function refresh() {
    if (busy || stopped) return;
    busy = true;
    try {
      const r = await loadProjectVisuals(env.source, env.getModel(), project);
      if (stopped) return;
      entries = r.entries;
      if (!selected()) selectedPath = entries.length ? entries[0].path : null;
      status.textContent = r.problems.join(' ');
      const sig = entries.map((e) => e.path + '|' + e.at + '|' + e.inProject).join('\n') + '#' + Math.floor(Date.now() / 60000);
      if (sig !== listSig) { listSig = sig; drawStrip(); }
      await drawViewer();
      const n = newestAt(entries);
      env.watcher && env.watcher.note(project, n);
      if (env.watcher) env.watcher.seen(project, Date.now()); else markSeen(project, Date.now());
    } catch (e) {
      status.textContent = 'Could not list pictures and pages: ' + msg(e);
    } finally {
      busy = false;
    }
  }

  drawFoot();
  note('Looking for pictures and pages…');
  loadToolStates();
  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  return {
    update() { /* the tile refreshes on its own 3 s timer */ },
    dispose() { stopped = true; clearInterval(timer); element.textContent = ''; },
  };
}
