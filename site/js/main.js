// Boots the source, builds the model every 5 s, renders the board.
import { parseSession, groupByProject } from './discovery.js';
import * as limits from './limits.js';
import { resumeLine } from './board.js';
import { renderList } from './list.js';
import { renderStrip, planReporterAll } from './strip.js';

const listState = { selectedKey: null };
let selectedSession = null;

// Placeholder until the session view issue: shows title, project and folder.
function showSession(session) {
  const box = document.getElementById('session');
  box.textContent = '';
  const h = document.createElement('h2');
  h.textContent = session.title;
  const p = document.createElement('p');
  p.textContent = 'Project: ' + session.project;
  const f = document.createElement('p');
  f.textContent = 'Folder: ' + session.cwd;
  box.append(h, p, f);
}

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5000;

function store(op, key, val) {
  try {
    return op === 'get' ? localStorage.getItem(key) : localStorage.setItem(key, val);
  } catch (e) {
    return null;
  }
}

// First run: the website opens the walkthrough while it has no folders; the desktop app finds folders
// itself, so it opens the walkthrough on first run to confirm what it found.
export function startWalkthrough(accounts, kind) {
  if (store('get', 'router.walkthroughDone') !== '1' && (accounts.length === 0 || kind === 'desktop')) {
    window.routerWalkthrough?.();
  }
}

function notice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}

async function pickSource() {
  if (window.routerDesktop) return (await import('./sources/desktop.js')).source;
  if (new URLSearchParams(location.search).get('demo') === '1') return (await import('./sources/demo.js')).source;
  if (!('showDirectoryPicker' in window)) return null;
  return (await import('./sources/browser.js')).source;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    notice('Copied: ' + text);
  } catch (e) {
    notice('Could not copy automatically. Select this and copy it: ' + text);
  }
}

async function boot() {
  $('notice-close').addEventListener('click', () => { $('notice').hidden = true; });
  let source;
  try {
    source = await pickSource();
  } catch (e) {
    notice('Could not start: ' + e);
    return;
  }
  if (!source) {
    $('unsupported').hidden = false;
    $('add-folder').hidden = true;
    $('help').hidden = true;
    $('status').textContent = '';
    return;
  }

  try { (await import('./walkthrough.js')).install(source); } catch (e) { notice('Walkthrough unavailable: ' + e); }
  const cache = new Map(); // account|project|file -> {size, mtimeMs, session}
  let lastUpdate = Date.now();
  let accountsNow = [];
  let lastLimits = {};
  let lastAccounts = [];
  let busy = false;

  const handlers = {
    onGrant: async (id) => { try { await source.grantPermission(id); } catch (e) { notice('Could not get access: ' + e); } refresh(true); },
    onReporter: async (id, on) => { try { await source.setReporter(id, on); } catch (e) { notice('Limit tracking not changed: ' + (e && e.message ? e.message : e)); } refresh(true); },
    onReporterAll: async () => {
      const ids = planReporterAll(lastAccounts, Object.fromEntries(lastAccounts.map((a) => [a.id, a.reporter])));
      const failed = [];
      for (const id of ids) {
        try { await source.setReporter(id, true); } catch (e) {
          const a = lastAccounts.find((x) => x.id === id);
          failed.push((a ? a.name : id) + ' (' + (e && e.message ? e.message : e) + ')');
        }
      }
      if (failed.length) notice('Limit tracking not turned on for: ' + failed.join(', '));
      refresh(true);
    },
    onCopyResume: (s) => {
      const a = accountsNow.find((x) => x.id === s.accountId);
      copyText(resumeLine(s, a && a.name));
    },
    onOpen: (s) => { selectedSession = s; showSession(s); },
    onAddFolder: async () => {
      try {
        const r = await source.addAccount();
        if (r && r.error) notice(r.message || r.error);
      } catch (e) { notice('Could not add the folder: ' + e); }
      refresh(true);
    },
  };
  if (source.kind === 'desktop') {
    handlers.onResume = (s) => source.resume(s).catch((e) => notice('Could not resume: ' + e));
    handlers.onNewSession = (project, cwd) => {
      const accountId = limits.accountForNewSession(accountsNow, lastLimits);
      if (!accountId) return notice('Add a Claude folder first, then start a session.');
      source.newSession(cwd, accountId).catch((e) => notice('Could not start a session: ' + e));
    };
  }

  $('add-folder').addEventListener('click', handlers.onAddFolder);
  $('empty-add').addEventListener('click', handlers.onAddFolder);
  $('help').addEventListener('click', () => {
    if (typeof window.routerWalkthrough === 'function') window.routerWalkthrough({ help: true });
    else notice('Add your Claude folder (usually .claude). Each row shows one session and how full its context is.');
  });

  window.addEventListener('router:refresh', () => refresh(true));
  async function refresh(force) {
    if (busy) return;
    busy = true;
    try {
      const nowMs = Date.now();
      const accounts = await source.listAccounts();
      const sessions = [];
      const readings = [];
      const seen = new Set();
      for (const a of accounts) {
        a.reporter = 'off';
        if (a.needsPermission) continue;
        try {
          // A limit-tracking problem must not hide the account's sessions.
          try {
            a.reporter = await source.reporterState(a.id);
          } catch (e) {
            notice('Could not check limit tracking for ' + a.name + ': ' + (e && e.message ? e.message : e));
          }
          for (const f of await source.listSessionFiles(a.id)) {
            const key = a.id + '|' + f.project + '|' + f.file;
            seen.add(key);
            let c = cache.get(key);
            if (!c || c.size !== f.size || c.mtimeMs !== f.mtimeMs) {
              const r = await source.readSessionText(a.id, f.project, f.file);
              c = { size: f.size, mtimeMs: f.mtimeMs, session: parseSession(r.text, { accountId: a.id, file: f.file, project: f.project, mtimeMs: f.mtimeMs, wasCut: r.wasCut, joinLine: r.joinLine }) };
              cache.set(key, c);
            }
            sessions.push(c.session);
          }
          for (const st of await source.readStatus(a.id)) {
            if (st && st.error) { notice('A limit file could not be read: ' + (st.file || '') + ' ' + (st.message || '')); continue; }
            const rd = limits.readingFromStatus(st, a.id);
            if (rd) readings.push(rd);
          }
        } catch (e) {
          notice('Problem reading ' + a.name + ': ' + (e && e.message ? e.message : e));
        }
      }
      for (const k of [...cache.keys()]) if (!seen.has(k)) cache.delete(k);

      // Prefer the reporter's exact context % for the session it came from.
      const merged = sessions.map((s) => {
        const rd = readings.find((r) => r.sessionId === s.id && r.accountId === s.accountId && r.contextPct != null);
        return rd ? { ...s, contextPct: Math.round(rd.contextPct) } : s;
      });
      const limitsByAccount = limits.accountLimits(readings, nowMs);
      lastLimits = limitsByAccount;
      lastAccounts = accounts;
      accountsNow = limits.orderByRoom(accounts, limitsByAccount);
      const groups = groupByProject(merged);
      lastUpdate = Date.now();
      $('empty').hidden = accounts.length > 0;
      $('split').hidden = accounts.length === 0;
      const perm = $('perm');
      perm.textContent = '';
      for (const a of accountsNow.filter((x) => x.needsPermission)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn primary';
        b.textContent = 'Allow access to ' + a.name;
        b.addEventListener('click', () => handlers.onGrant(a.id));
        perm.appendChild(b);
      }
      renderList($('list'), { accounts: accountsNow, groups, limitsByAccount, nowMs, kind: source.kind }, handlers, listState);
      renderStrip($('strip'), { accounts: accountsNow, limitsByAccount, states: Object.fromEntries(accounts.map((a) => [a.id, a.reporter])), nowMs }, handlers);
      updateStatus();
      startWalkthrough(accounts, source.kind);
    } catch (e) {
      notice('Could not read your folders: ' + (e && e.message ? e.message : e));
    } finally {
      busy = false;
    }
  }
  function updateStatus() {
    const s = Math.round((Date.now() - lastUpdate) / 1000);
    const n = accountsNow.length;
    $('status').textContent = n + ' Claude folder' + (n === 1 ? '' : 's') + ' · updated ' + (s < 2 ? 'just now' : s + 's ago');
  }
  await refresh(true);
  setInterval(() => refresh(false), REFRESH_MS);
  setInterval(updateStatus, 1000);
}

boot();
