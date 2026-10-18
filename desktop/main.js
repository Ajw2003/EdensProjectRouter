'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, screen, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { findAccounts, readEmail, validateAccountName } = require('./accounts');
const { buildResumeCommand, buildNewSessionCommand, buildPtyCommand, buildLoginCommand } = require('./launch');
const { copySession } = require('./transfer');
const handoff = require('./handoff');
const src = require('./fsSource');
const { findClaude, createPtyManager } = require('./pty');
const layoutStore = require('./layoutstore');
const { placeWindow, normalizeLayoutFile } = layoutStore;
const visuals = require('./visuals');
const { checkRequest, fileUrl } = require('./filesguard');
const { showsFilePath } = require('./showtool/server.cjs');

const DEBUG = !!process.env.ROUTER_DEBUG;
const log = (...a) => { if (DEBUG) console.log('[router]', ...a); };

const SITE = app.isPackaged ? path.join(process.resourcesPath, 'site') : path.join(__dirname, '..', 'site');
src.setReporterPath(path.join(SITE, 'js', 'reporter.js'));
visuals.setSitePath(SITE);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // Visuals: files under a known project folder (see registerVisualsProtocol).
  { scheme: 'router-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ----- accounts block (issue #17): email, copy a session to another account, add an account -----
// Folders made by "Add account" that are not signed in yet, so discovery cannot see them: id -> { id, name, dir }.
const loginPending = new Map();
const emailLogged = new Set();
const logOnce = (msg) => { if (!emailLogged.has(msg)) { emailLogged.add(msg); console.error('account email:', msg); } };

function accounts() {
  const list = findAccounts(os.homedir(), process.env);
  for (const a of list) loginPending.delete(a.id); // found by the scan: no longer needs the special login launch
  return list;
}
function account(id) {
  const a = accounts().find((x) => x.id === id) || loginPending.get(id);
  if (!a) throw new Error('Unknown account ' + id);
  return a;
}

// Starts the plan's process; resolves when it started, rejects with its error.
function start(plan) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(plan.file, plan.args, { cwd: plan.cwd, env: plan.env, detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) {
      return reject(e);
    }
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

async function launch(build) {
  const base = { homeDir: os.homedir(), env: process.env };
  const first = build(base);
  try {
    return await start(first);
  } catch (e1) {
    if (process.platform !== 'win32') {
      throw new Error('Could not open a terminal (' + e1.message + '). Run "claude" yourself in the session folder.');
    }
    log('wt.exe failed, falling back to cmd.exe:', e1.message);
    try {
      return await start(build({ ...base, useWt: false }));
    } catch (e2) {
      throw new Error('Could not open Windows Terminal (' + e1.message + ') or Command Prompt (' + e2.message + ').');
    }
  }
}

// ---------- windows ----------
// One BrowserWindow per grid window. layoutState is the layout file (version 2) kept in memory; each window has an entry in
// layoutState.windows with its id, display, bounds and dockview JSON.
let layoutState = { version: 2, saved: [], windows: [] };
let layoutReadError = null; // told to the first page that asks, once
const wins = new Map(); // window id -> { id, win, ready, pending: [tile payloads waiting for the page] }
const winIdOf = new Map(); // webContents id -> window id
const ptyOwner = new Map(); // ptyId -> window id that shows it
let quitting = false;
let quitReady = false;

const sendToWindow = (id, channel, payload) => {
  const w = wins.get(id);
  if (w && !w.win.isDestroyed()) w.win.webContents.send(channel, payload);
};
const sendToPtyOwner = (ptyId, channel, payload) => {
  if (ptyOwner.has(ptyId)) sendToWindow(ptyOwner.get(ptyId), channel, payload);
};
let ptys = null;
function ptyManager() {
  if (!ptys) {
    ptys = createPtyManager({
      onData: (ptyId, data, end) => sendToPtyOwner(ptyId, 'router:ptyData', { ptyId, data, end }),
      onExit: (ptyId, exitCode) => { sendToPtyOwner(ptyId, 'router:ptyExit', { ptyId, exitCode }); ptyOwner.delete(ptyId); },
    });
  }
  return ptys;
}

const layoutFile = () => path.join(app.getPath('userData'), 'layout.json');
const entryOf = (id) => layoutState.windows.find((w) => w.id === id);

// Records each open window's display and bounds, then writes the layout file. A failure is logged, never silent.
function flushLayout() {
  for (const w of wins.values()) {
    const e = entryOf(w.id);
    if (!e || w.win.isDestroyed()) continue;
    e.bounds = w.win.getBounds();
    e.displayId = screen.getDisplayMatching(e.bounds).id;
  }
  try { layoutStore.writeLayout(layoutFile(), layoutState); } catch (e) { console.error('could not save the layout:', e); }
}

// Asks one page for its layout file object. Resolves when done; a failure is logged, never silent.
async function snapshotWindow(w) {
  try {
    const data = await Promise.race([
      w.win.webContents.executeJavaScript('window.routerGridSnapshot ? window.routerGridSnapshot() : null'),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('the page did not answer in 3 s')), 3000)),
    ]);
    const e = entryOf(w.id);
    if (data && e) {
      e.layout = data.current || e.layout;
      if (Array.isArray(data.saved)) layoutState.saved = data.saved;
    }
  } catch (e) {
    console.error('could not save the layout of window ' + w.id + ' on quit:', e);
  }
}
async function saveAll() {
  await Promise.all([...wins.values()].map(snapshotWindow));
  flushLayout();
}

function createWindow(entry) {
  const id = entry.id;
  const placed = placeWindow(entry, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
  const win = new BrowserWindow({
    ...placed,
    minWidth: 380,
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    title: 'Project Router',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true, // Visuals tile: pages and claude.ai artifacts (see the will-attach-webview rules in registerVisualsWebviews)
    },
  });
  const w = { id, win, ready: false, pending: [] };
  const contentsId = win.webContents.id;
  wins.set(id, w);
  winIdOf.set(contentsId, id);
  const retitle = () => win.setTitle('Project Router (window ' + id + ')');
  win.on('page-title-updated', (e) => { e.preventDefault(); retitle(); });
  retitle();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('app://router/')) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  win.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame) w.ready = false; });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error('load failed:', code, desc, url));
  if (DEBUG) {
    // Debug only: prove the preload bridge and IPC work end to end from the page.
    win.webContents.on('did-finish-load', async () => {
      try {
        const n = await win.webContents.executeJavaScript('window.routerDesktop.listAccounts().then(a => a.length)');
        log('renderer IPC listAccounts ->', n);
      } catch (e) {
        console.error('renderer IPC check failed:', e);
      }
    });
  }
  // Closing a window that is not the last one just closes it. Closing the last one quits (which asks first and saves all).
  win.on('close', (e) => {
    if (quitReady || wins.size > 1) return;
    e.preventDefault();
    app.quit();
  });
  win.on('closed', () => {
    wins.delete(id);
    winIdOf.delete(contentsId);
    if (!quitting) {
      layoutState.windows = layoutState.windows.filter((x) => x.id !== id);
      flushLayout();
    }
  });
  win.loadURL('app://router/index.html');
  return w;
}

function openNewWindow() {
  const id = Math.max(0, ...layoutState.windows.map((x) => x.id), ...wins.keys()) + 1;
  const entry = { id, displayId: null, bounds: null, layout: null };
  // Put it on a monitor that has no grid window yet; with none free, step it down and right of the focused window so
  // it doesn't sit exactly on top.
  const used = new Set([...wins.values()].map((w) => screen.getDisplayMatching(w.win.getBounds()).id));
  const free = screen.getAllDisplays().find((d) => !used.has(d.id));
  if (free) {
    entry.displayId = free.id;
  } else {
    const focused = BrowserWindow.getFocusedWindow() || ([...wins.values()][0] || {}).win;
    if (focused) {
      const fb = focused.getBounds();
      entry.displayId = screen.getDisplayMatching(fb).id;
      entry.bounds = { x: fb.x + 40, y: fb.y + 40, width: Math.max(380, fb.width - 40), height: Math.max(300, fb.height - 40) };
    }
  }
  layoutState.windows.push(entry);
  return createWindow(entry);
}

// Choice 2A: quitting with running sessions asks first. Resolves true when it is fine to go on.
async function confirmQuit() {
  const running = ptys ? ptys.list() : [];
  if (!running.length) return true;
  const names = running.map((p) => '- ' + (p.title || p.cwd) + ' (' + p.cwd + ')').join('\n');
  const parent = BrowserWindow.getFocusedWindow() || [...wins.values()][0].win;
  const r = await dialog.showMessageBox(parent, {
    type: 'warning',
    buttons: ['Close them and quit', 'Go back'],
    defaultId: 1,
    cancelId: 1,
    title: 'Sessions are still running',
    message: running.length === 1 ? 'A session is still running.' : running.length + ' sessions are still running.',
    detail: names + '\n\nQuitting ends them.',
  });
  return r.response === 0;
}

// IPC for accounts (issue #17): copySessionTo(sessionId, fromAccountId, project, toAccountId), createAccount(name)
function registerAccountIpc(h) {
  h('copySessionTo', async (sessionId, fromAccountId, project, toAccountId) => {
    const r = copySession(account(fromAccountId).dir, account(toAccountId).dir, project, sessionId);
    log('copySessionTo', sessionId, fromAccountId, '->', toAccountId, 'copied', r.copied.length, 'skipped', r.skipped.length);
    return r;
  });
  // Makes <home>/.claude-<name> (refuses if it exists). The renderer then opens a tile that runs `claude auth login` there.
  h('createAccount', async (name) => {
    const clean = validateAccountName(name);
    const dir = path.join(os.homedir(), '.claude-' + clean);
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if (e && e.code === 'EEXIST') throw new Error('The folder ' + dir + ' already exists. Pick another name.');
      throw e;
    }
    const a = { id: '.claude-' + clean, name: '.claude-' + clean, dir };
    loginPending.set(a.id, a);
    return { id: a.id, name: a.name, home: os.homedir() };
  });
}

function registerIpc() {
  const h = (name, fn) => ipcMain.handle('router:' + name, async (_e, ...args) => fn(...args));
  registerAccountIpc(h);
  // Same, but the handler also gets the id of the window that asked.
  const hw = (name, fn) => ipcMain.handle('router:' + name, async (e, ...args) => fn(winIdOf.get(e.sender.id), ...args));
  h('listAccounts', async () => {
    const list = accounts().map((a) => ({ id: a.id, name: a.name, needsPermission: false, email: readEmail(a.dir, os.homedir(), logOnce) }));
    log('listAccounts ->', list.length, list.map((a) => a.name).join(','));
    return list;
  });
  h('addAccount', async () => null); // desktop re-scans in the renderer wrapper
  h('grantPermission', async () => true);
  h('listSessionFiles', async (id) => src.listSessionFiles(account(id).dir));
  h('readSessionText', async (id, project, file) => src.readSessionText(account(id).dir, project, file));
  h('readStatus', async (id) => src.readStatus(account(id).dir));
  h('reporterState', async (id) => src.reporterState(account(id).dir));
  h('setReporter', async (id, on) => src.setReporter(account(id).dir, !!on));
  h('claudeRunning', async () => src.claudeRunning());
  h('resume', async (session) => {
    if (!session || typeof session !== 'object') throw new Error('No session given.');
    const a = account(session.accountId);
    return launch((o) => buildResumeCommand(session.id, session.cwd, { ...o, accountDir: a.dir }));
  });
  h('readTranscript', async (id, project, file, fromByte) => src.readTranscript(account(id).dir, project, file, fromByte));
  hw('ptyOpen', async (winId, o) => {
    try {
      if (!o || typeof o !== 'object') throw new Error('No session given.');
      const signingIn = loginPending.has(o.accountId); // a folder made by "Add account" that is not signed in yet
      const a = account(o.accountId);
      const claudePath = findClaude();
      if (!claudePath) return { error: "Claude Code wasn't found. Install it, then try again.", notFound: true };
      const plan = signingIn
        ? buildLoginCommand({ accountDir: a.dir, homeDir: os.homedir(), env: process.env, platform: process.platform, claudePath })
        : buildPtyCommand({
          sessionId: o.sessionId || null, fork: o.fork === true, cwd: o.cwd, accountDir: a.dir, homeDir: os.homedir(),
          env: process.env, platform: process.platform, claudePath,
        });
      const ptyId = ptyManager().open(plan, { sessionId: o.fork ? null : (o.sessionId || null), title: o.title || path.basename(String(o.cwd)) }, o.cols, o.rows);
      ptyOwner.set(ptyId, winId);
      return { ptyId };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  });
  hw('layoutGet', async (winId) => {
    if (layoutReadError) { const m = layoutReadError; layoutReadError = null; throw new Error(m); }
    const e = entryOf(winId);
    return { version: 1, current: e ? e.layout : null, saved: layoutState.saved };
  });
  hw('layoutSet', async (winId, data) => {
    const e = entryOf(winId);
    if (!e || !data || typeof data !== 'object') throw new Error('A layout object is needed.');
    e.layout = data.current || null;
    if (Array.isArray(data.saved)) layoutState.saved = data.saved;
    flushLayout();
    return true;
  });
  h('ptyBuffer', async (ptyId) => ptyManager().buffer(ptyId));
  hw('windowList', async (winId) => [...wins.keys()].sort((a, b) => a - b).map((id) => ({ id, self: id === winId })));
  h('newWindow', async () => openNewWindow().id);
  // Sends a tile to another window (an id, or 'new'). Resolves with the target id once the message is on its way.
  hw('moveTile', async (winId, target, tile) => {
    if (!tile || typeof tile !== 'object') throw new Error('No tile given.');
    const t = target === 'new' ? openNewWindow() : wins.get(target);
    if (!t || t.id === winId) throw new Error('That window is not open.');
    if (tile.ptyId) ptyOwner.set(tile.ptyId, t.id);
    if (t.ready) t.win.webContents.send('router:tileIn', tile); else t.pending.push(tile);
    return t.id;
  });
  hw('gridReady', async (winId) => {
    const w = wins.get(winId);
    if (!w) return false;
    w.ready = true;
    for (const tile of w.pending.splice(0)) w.win.webContents.send('router:tileIn', tile);
    return true;
  });
  h('ptyWrite', async (ptyId, data) => ptyManager().write(ptyId, data));
  h('ptyResize', async (ptyId, cols, rows) => ptyManager().resize(ptyId, cols, rows));
  h('ptyClose', async (ptyId) => ptyManager().close(ptyId));
  h('ptyList', async () => ptyManager().list());
  h('newSession', async (cwd, accountId) => {
    const a = account(accountId);
    return launch((o) => buildNewSessionCommand(cwd, { ...o, accountDir: a.dir }));
  });
}

// ---------- send to (issue #21) ----------
const linksFile = () => path.join(app.getPath('userData'), 'handoff-settings.json');

// Asks one page for its session tiles. A page that does not answer in 3 s is skipped and logged, never silent.
async function tilesOf(w) {
  try {
    const list = await Promise.race([
      w.win.webContents.executeJavaScript('window.routerGridTiles ? window.routerGridTiles() : []'),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('the page did not answer in 3 s')), 3000)),
    ]);
    return Array.isArray(list) ? list.map((t) => ({ ...t, winId: w.id })) : [];
  } catch (e) {
    console.error('could not list the tiles of window ' + w.id + ':', e);
    return [];
  }
}

function registerHandoffIpc() {
  const h = (name, fn) => ipcMain.handle('router:' + name, async (_e, ...args) => fn(...args));
  h('handoffWrite', async (cwd, name, text) => handoff.write(cwd, name, text));
  h('handoffCopyFile', async (cwd, src) => handoff.copyFile(cwd, src));
  h('handoffList', async (cwd) => handoff.list(cwd));
  h('gitExcludeGet', async (cwd) => handoff.gitExcludeGet(cwd));
  h('gitExcludeSet', async (cwd, on) => handoff.gitExcludeSet(cwd, !!on));
  h('handoffSummary', async (session) => {
    if (!session || typeof session !== 'object') throw new Error('No session given.');
    const a = account(session.accountId);
    return handoff.summary({
      sessionId: session.id, cwd: session.cwd, accountDir: a.dir, homeDir: os.homedir(), env: process.env,
      platform: process.platform, claudePath: findClaude(),
    });
  });
  h('handoffLinks', async () => Object.fromEntries(handoff.readLinks(linksFile()).map((l) => [l.child, l.parent])));
  h('handoffLinkAdd', async (child, parent) => { handoff.addLink(linksFile(), child, parent); return true; });
  ipcMain.handle('router:handoffTiles', async (e) => {
    const self = winIdOf.get(e.sender.id);
    const all = await Promise.all([...wins.values()].map(tilesOf));
    return all.flat().map((t) => ({ ...t, self: t.winId === self }));
  });
  // Hands text for a tile to the window that shows it, and brings that window forward.
  h('handoffRelay', async (winId, payload) => {
    const w = wins.get(winId);
    if (!w || w.win.isDestroyed()) throw new Error('That window is not open any more.');
    w.win.webContents.send('router:handoffDeliver', payload);
    if (w.win.isMinimized()) w.win.restore();
    w.win.show();
    w.win.focus();
    return true;
  });
}

// ---------- visuals ----------
const PAGES_PARTITION = 'router-pages';

// router-file:// serves files under a known project folder, nothing else. Registered on the app's session and on the pages one.
function registerVisualsProtocol() {
  const handler = async (request) => {
    const r = checkRequest(request.url, visuals.knownRoots());
    if (!r.ok) {
      log('router-file refused', r.status, request.url);
      return new Response(r.reason, { status: r.status });
    }
    return net.fetch(pathToFileURL(r.file).href, { headers: request.headers });
  };
  for (const ses of [session.defaultSession, session.fromPartition(PAGES_PARTITION)]) ses.protocol.handle('router-file', handler);
}

// Only our two kinds of webview may be attached, whatever the page asked for.
function registerVisualsWebviews() {
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') {
      // Inside a webview: pages stay on router-file:// (their own folder); links out open in the browser, not in the tile.
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
      contents.on('will-navigate', (e, url) => {
        const isPage = contents.session === session.fromPartition(PAGES_PARTITION);
        if (isPage && url.startsWith('router-file://local/')) return;
        if (!isPage && /^https:\/\/([\w-]+\.)?claude\.ai\//i.test(url)) return;
        e.preventDefault();
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      });
    }
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      const part = String(params.partition || '');
      const isPage = part === PAGES_PARTITION;
      const isClaude = /^persist:claude-[\w.-]+$/.test(part);
      if (!isPage && !isClaude) { event.preventDefault(); return; }
      delete webPreferences.preload;
      delete webPreferences.preloadURL;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.webviewTag = false;
      if (isPage) webPreferences.preload = path.join(__dirname, 'pagepreload.cjs');
      const src = String(params.src || '');
      const okSrc = isPage ? /^router-file:\/\/local\//.test(src) || src === 'about:blank' : /^https:\/\/claude\.ai\//i.test(src);
      if (!okSrc) event.preventDefault();
    });
  });
}

function registerVisualsIpc() {
  const h = (name, fn) => ipcMain.handle('router:' + name, async (_e, ...args) => fn(...args));
  // project = { name, sessions: [{ id, projectDir, file, cwd }] } for this account.
  h('listVisuals', async (accountId, project) => visuals.listVisuals(account(accountId).dir, project, showsFilePath(process.env, os.homedir())));
  const allowed = (p) => {
    const r = checkRequest(fileUrl(String(p || '')), visuals.knownRoots());
    if (!r.ok) throw new Error('That file is not inside a project folder, so the app will not open it.');
    return r.file;
  };
  h('openVisualFile', async (p) => {
    if (/^https:\/\/claude\.ai\//i.test(String(p))) { await shell.openExternal(String(p)); return true; }
    const err = await shell.openPath(allowed(p));
    if (err) throw new Error(err);
    return true;
  });
  h('readVisualText', async (p) => {
    const file = allowed(p);
    const st = await fs.promises.stat(file);
    if (st.size > 2 * 1024 * 1024) throw new Error('That file is over 2 MB, too big to show here. Use Open in browser.');
    return fs.promises.readFile(file, 'utf8');
  });
  h('showVisualInFolder', async (p) => { shell.showItemInFolder(allowed(p)); return true; });
  h('showToolState', async (accountId) => visuals.showToolState(account(accountId).dir));
  h('setShowTool', async (accountId, on) => visuals.setShowTool(!!on, account(accountId).dir, {
    claudePath: findClaude(), exe: process.execPath, serverPath: path.join(__dirname, 'showtool', 'server.cjs'),
  }));
}

function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { return new Response('Bad request', { status: 400 }); }
    if (rel === '/' || rel === '') rel = '/index.html';
    const full = path.resolve(SITE, '.' + rel);
    if (full !== SITE && !full.startsWith(SITE + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      log('404', rel);
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(full).href);
  });
}

process.on('uncaughtException', (e) => { console.error('uncaught:', e); });

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  registerVisualsProtocol();
  registerVisualsWebviews();
  registerVisualsIpc();
  registerHandoffIpc();
  if (DEBUG) log('accounts at startup:', accounts().length);
  try {
    layoutState = normalizeLayoutFile(layoutStore.readLayout(layoutFile()));
  } catch (e) {
    console.error('could not read the saved layout:', e);
    layoutReadError = String((e && e.message) || e);
  }
  if (!layoutState.windows.length) layoutState.windows.push({ id: 1, displayId: null, bounds: null, layout: null });
  for (const entry of layoutState.windows.slice()) createWindow(entry);
  app.on('activate', () => { if (wins.size === 0) openNewWindow(); });
});
// Quit: ask about running sessions, save every window, then really quit.
app.on('before-quit', (e) => {
  if (quitReady) return;
  e.preventDefault();
  if (quitting) return;
  quitting = true;
  confirmQuit()
    .then(async (ok) => {
      if (!ok) { quitting = false; return; }
      await saveAll();
      quitReady = true;
      app.quit();
    })
    .catch((err) => { console.error('quit failed:', err); quitting = false; });
});
app.on('will-quit', () => { if (ptys) ptys.killAll(); });
app.on('window-all-closed', () => app.quit());
