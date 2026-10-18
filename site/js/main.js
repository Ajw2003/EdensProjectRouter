// Boots the source, builds the model every 5 s, renders the board.
import { parseSession, groupByProject } from './discovery.js';
import * as limits from './limits.js';
import { renderBoard, resumeLine } from './board.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5000;

function store(op, key, val) {
  try {
    return op === 'get' ? localStorage.getItem(key) : localStorage.setItem(key, val);
  } catch (e) {
    return null;
  }
}

// Hook point: another builder defines window.routerWalkthrough. Runs when not done and no accounts exist.
export function startWalkthrough(accounts) {
  if (store('get', 'router.walkthroughDone') !== '1' && accounts.length === 0) {
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

  const cache = new Map(); // account|project|file -> {size, mtimeMs, session}
  let lastUpdate = Date.now();
  let accountsNow = [];
  let busy = false;

  const handlers = {
    onGrant: async (id) => { try { await source.grantPermission(id); } catch (e) { notice('Could not get access: ' + e); } refresh(true); },
    onReporter: async (id, on) => { try { await source.setReporter(id, on); } catch (e) { notice('Limit tracking not changed: ' + (e && e.message ? e.message : e)); } refresh(true); },
    onCopyResume: (s) => {
      const a = accountsNow.find((x) => x.id === s.accountId);
      copyText(resumeLine(s, a && a.name));
    },
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
    handlers.onNewSession = (project, cwd) => source.newSession(cwd, null).catch((e) => notice('Could not start a session: ' + e));
  }

  $('add-folder').addEventListener('click', handlers.onAddFolder);
  $('empty-add').addEventListener('click', handlers.onAddFolder);
  $('help').addEventListener('click', () => {
    if (typeof window.routerWalkthrough === 'function') window.routerWalkthrough();
    else notice('Add your Claude folder (usually .claude). Each card shows one session, how full its context is, and your 5-hour and weekly limits.');
  });

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
          a.reporter = await source.reporterState(a.id);
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
      accountsNow = limits.orderByRoom(accounts, limitsByAccount);
      const groups = groupByProject(merged);
      lastUpdate = Date.now();
      $('empty').hidden = accounts.length > 0;
      $('board').hidden = accounts.length === 0;
      renderBoard($('board'), { accounts: accountsNow, groups, limitsByAccount, nowMs, kind: source.kind }, handlers, { force: !!force });
      updateStatus();
      startWalkthrough(accounts);
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
