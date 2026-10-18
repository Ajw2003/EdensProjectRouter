'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { findAccounts } = require('./accounts');
const { buildResumeCommand, buildNewSessionCommand } = require('./launch');
const src = require('./fsSource');

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
app.on('window-all-closed', () => app.quit());
