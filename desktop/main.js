'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { findAccounts } = require('./accounts');
const { buildResumeCommand, buildNewSessionCommand, buildPtyCommand } = require('./launch');
const src = require('./fsSource');
const { findClaude, createPtyManager } = require('./pty');
const layoutStore = require('./layoutstore');

const DEBUG = !!process.env.ROUTER_DEBUG;
const log = (...a) => { if (DEBUG) console.log('[router]', ...a); };

const SITE = app.isPackaged ? path.join(process.resourcesPath, 'site') : path.join(__dirname, '..', 'site');
src.setReporterPath(path.join(SITE, 'js', 'reporter.js'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function accounts() {
  return findAccounts(os.homedir(), process.env);
}
function account(id) {
  const a = accounts().find((x) => x.id === id);
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

let mainWin = null;
const sendToWin = (channel, payload) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
};
let ptys = null;
function ptyManager() {
  if (!ptys) {
    ptys = createPtyManager({
      onData: (ptyId, data) => sendToWin('router:ptyData', { ptyId, data }),
      onExit: (ptyId, exitCode) => sendToWin('router:ptyExit', { ptyId, exitCode }),
    });
  }
  return ptys;
}

const layoutFile = () => path.join(app.getPath('userData'), 'layout.json');

// Asks the page for its layout file object and writes it. Resolves when done; a failure is logged, never silent.
async function saveLayoutFrom(win) {
  try {
    const data = await Promise.race([
      win.webContents.executeJavaScript('window.routerGridSnapshot ? window.routerGridSnapshot() : null'),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('the page did not answer in 3 s')), 3000)),
    ]);
    if (data) layoutStore.writeLayout(layoutFile(), data);
  } catch (e) {
    console.error('could not save the layout on quit:', e);
  }
}

function registerIpc() {
  const h = (name, fn) => ipcMain.handle('router:' + name, async (_e, ...args) => fn(...args));
  h('listAccounts', async () => {
    const list = accounts().map((a) => ({ id: a.id, name: a.name, needsPermission: false }));
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
  h('ptyOpen', async (o) => {
    try {
      if (!o || typeof o !== 'object') throw new Error('No session given.');
      const a = account(o.accountId);
      const claudePath = findClaude();
      if (!claudePath) return { error: "Claude Code wasn't found. Install it, then try again.", notFound: true };
      const plan = buildPtyCommand({
        sessionId: o.sessionId || null, cwd: o.cwd, accountDir: a.dir, homeDir: os.homedir(),
        env: process.env, platform: process.platform, claudePath,
      });
      const ptyId = ptyManager().open(plan, { sessionId: o.sessionId || null, title: o.title || path.basename(String(o.cwd)) }, o.cols, o.rows);
      return { ptyId };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  });
  h('layoutGet', async () => layoutStore.readLayout(layoutFile()));
  h('layoutSet', async (data) => { layoutStore.writeLayout(layoutFile(), data); return true; });
  h('ptyWrite', async (ptyId, data) => ptyManager().write(ptyId, data));
  h('ptyResize', async (ptyId, cols, rows) => ptyManager().resize(ptyId, cols, rows));
  h('ptyClose', async (ptyId) => ptyManager().close(ptyId));
  h('ptyList', async () => ptyManager().list());
  h('newSession', async (cwd, accountId) => {
    const a = account(accountId);
    return launch((o) => buildNewSessionCommand(cwd, { ...o, accountDir: a.dir }));
  });
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    title: 'Project Router',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('app://router/')) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
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
  // Choice 2A: closing the window with running sessions asks first.
  let confirmed = false;
  let saved = false;
  win.on('close', (e) => {
    const running = ptys ? ptys.list() : [];
    if (!confirmed && running.length > 0) {
      e.preventDefault();
      const names = running.map((p) => '- ' + (p.title || p.cwd) + ' (' + p.cwd + ')').join('\n');
      dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Close them and quit', 'Go back'],
        defaultId: 1,
        cancelId: 1,
        title: 'Sessions are still running',
        message: running.length === 1 ? 'A session is still running.' : running.length + ' sessions are still running.',
        detail: names + '\n\nQuitting ends them.',
      }).then((r) => {
        if (r.response !== 0) return;
        confirmed = true;
        win.close();
      }).catch((err) => console.error('quit prompt failed:', err));
      return;
    }
    if (saved) return;
    // Quitting: save the grid layout (with the saved layouts) before the page goes away.
    e.preventDefault();
    saveLayoutFrom(win).then(() => { saved = true; win.close(); });
  });
  win.on('closed', () => { if (mainWin === win) mainWin = null; });
  mainWin = win;
  win.loadURL('app://router/index.html');
  return win;
}

process.on('uncaughtException', (e) => { console.error('uncaught:', e); });

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  if (DEBUG) log('accounts at startup:', accounts().length);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => { if (ptys) ptys.killAll(); });
app.on('window-all-closed', () => app.quit());
