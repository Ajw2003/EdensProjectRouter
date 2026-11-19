// Boots the source, builds the model every 5 s, renders the board.
import { parseSession, groupByProject } from './discovery.js';
import * as limits from './limits.js';
import { resumeLine } from './board.js';
import { renderList } from './list.js';
import { renderStrip, planReporterAll } from './strip.js';
import { openSession } from './sessionview.js';
import { chooseNewSessionAccount, validateAccountName, pendingLogins, duplicateAccount } from './accounts.js';
import { askNewSession } from './newsession.js';
import { askText, openMenu } from './menu.js';
import { accountLabel, sameEmailNotes } from './accounts.js';

const listState = { selectedKey: null };
let selectedSession = null;
let view = null; // stop() of the open session view
let panels = null; // terminal panels (app only, used by the grid's session tiles)
let grid = null; // the calm shell: session list and panes (app only)

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5000;

function store(op, key, val) {
  try {
    return op === 'get' ? localStorage.getItem(key) : localStorage.setItem(key, val);
  } catch (e) {
    return null;
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
  let lastLimits = {};
  let lastAccounts = [];
  let busy = false;
  let ask = null; // Ask another session (app only)
  let sendTo = null; // Send to… (app only, needs the grid)
  let linkProblem = false;
  let gridModel = { accounts: [], groups: [], limitsByAccount: {}, nowMs: Date.now(), kind: source.kind, runningKeys: new Set() };

  // The account New session uses: the one picked in the strip menu, else the one with the most room.
  const newSessionAccount = () => chooseNewSessionAccount(accountsNow, store('get', 'router.newSessionAccount'), limits.accountForNewSession(accountsNow, lastLimits));

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
    onPickAccount: (id) => { store('set', 'router.newSessionAccount', id); refresh(true); },
    onOpen: (s) => {
      selectedSession = s;
      view = openSession($('session'), s, {
        kind: source.kind, source,
        get accounts() { return accountsNow; },
        get limitsByAccount() { return lastLimits; },
        onCopyResume: handlers.onCopyResume,
        onReporter: handlers.onReporter,
        onError: notice,
      });
    },
    onAddFolder: async () => {
      try {
        const r = await source.addAccount();
        if (r && r.error) notice(r.message || r.error);
      } catch (e) { notice('Could not add the folder: ' + e); }
      refresh(true);
    },
  };
  if (source.createPanels) {
    panels = source.createPanels(() => refresh(true));
    try {
      document.body.classList.add('app-mode');
      $('split').hidden = true;
      $('shell').hidden = false;
      grid = await (await import('./shell.js')).createShell({
        source, panels, notice, refresh: () => refresh(true),
        listBody: $('shell-list-body'), panesEl: $('panes'), search: $('shell-search'), filterEl: $('shell-filter'),
        getModel: () => gridModel,
        onReporter: (id, on) => handlers.onReporter(id, on),
        getSendTo: () => sendTo,
        getAsk: () => ask,
      });
      // Under 700 px wide the shell shows the list or one pane (see grid.css); opening a session shows the pane, Back the list.
      const showPane = (v) => { $('shell').dataset.view = v; };
      showPane('list');
      $('shell-back').addEventListener('click', () => showPane('list'));
      $('shell-list-body').addEventListener('click', (e) => { if (e.target.closest('.srow')) showPane('pane'); }); // the shell's own list opens the pane
      handlers.onOpen = (s) => grid.openSession(s);
      // Add account: ask for a short name, make the folder, open a tile that runs `claude auth login` there.
      // When that process ends the panels call refresh, which re-scans the folders.
      handlers.onAddAccount = async () => {
        const name = await askText({
          title: 'Add account', label: 'Short name (letters, digits, dash)', placeholder: 'work',
          okLabel: 'Create folder and sign in', validate: validateAccountName,
        });
        if (!name) return;
        const dup = duplicateAccount(accountsNow, { folder: '.claude-' + name });
        if (dup) return notice('That account is already added as ' + accountLabel(dup) + '.');
        try {
          const r = await source.createAccount(name);
          pendingLogins.set(r.id, { name, home: r.home });
          grid.newSession('Sign in: ' + name, r.home, r.id);
        } catch (e) {
          const why = String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
          notice('Could not add the account: ' + why);
        }
      };
      if (source.handoffTiles) {
        const { createSendTo } = await import('./sendto.js');
        sendTo = createSendTo({ source, grid, notice, getModel: () => gridModel, newSessionAccount });
        if (source.handoffAsk) {
          const { createAsk } = await import('./askdialog.js');
          ask = createAsk({ source, grid, notice, getModel: () => gridModel });
        }
        handlers.onSendTo = (anchor, s) => sendTo.open(anchor, { kind: 'conversation', accountId: s.accountId, id: s.id });
        handlers.onProjectMenu = (anchor, project, cwd) => sendTo.projectMenu(anchor, project, cwd);
        window.routerGridTiles = () => grid.sessionTiles(); // main asks each window for its session tiles
        source.onHandoffDeliver((p) => grid.deliver(p.id, p.text).catch((e) => notice('Could not type into the session: ' + (e && e.message ? e.message : e))));
      }
      handlers.onNewSession = (project, cwd) => {
        const accountId = newSessionAccount();
        if (!accountId) return notice('Add a Claude folder first, then start a session.');
        try { grid.newSession(project, cwd, accountId); showPane('pane'); } catch (e) { notice(e.message); }
      };
      $('new-session').addEventListener('click', async () => {
        const seen = new Set();
        const projects = gridModel.groups.map((g) => ({ project: g.project, cwd: (g.sessions[0] && g.sessions[0].cwd) || '' })).filter((p) => !seen.has(p.project) && seen.add(p.project));
        if (!projects.length || !accountsNow.length) return notice('Add a Claude folder first, then start a session.');
        const pick = await askNewSession({ projects, accounts: accountsNow, limitsByAccount: lastLimits });
        if (!pick) return;
        try { grid.newSession(pick.project, pick.cwd, pick.accountId); showPane('pane'); } catch (e) { notice(e.message); }
      });
      // More: what the old top bar held (the account New session uses, add account, add folder).
      $('shell-more').addEventListener('click', async () => {
        const chosen = newSessionAccount();
        // The phone link switch and pairing belong to the PC; a phone's own page does not offer them.
        let phoneOn = false;
        const pcOnly = !window.routerDesktop.isRemote && source.phoneLinkState;
        if (pcOnly) { try { phoneOn = (await source.phoneLinkState()).on; } catch (e) { notice('Could not read the phone link state: ' + e); } }
        const dupes = sameEmailNotes(accountsNow);
        const items = accountsNow.map((a) => ({ label: 'New sessions use ' + accountLabel(a) + (dupes[a.id] !== undefined ? ' (' + a.name + ')' : ''), checked: a.id === chosen, run: () => handlers.onPickAccount(a.id) }));
        items.push({ separator: true }, { label: 'What to show…', run: async () => (await import('./calmpage.js')).openCalmPage({ get: grid.calm, set: grid.setCalm }) }, ...(pcOnly && source.listAllAccounts ? [{ label: 'Accounts…', run: async () => (await import('./accountsdialog.js')).openAccountsDialog(source) }] : []), { label: 'Add account…', run: () => handlers.onAddAccount() }, { label: 'Add Claude folder', run: () => handlers.onAddFolder() });
        if (pcOnly) {
          items.push({ separator: true },
            { label: phoneOn ? 'Phone link: on (turn off)' : 'Phone link: off (turn on)', run: async () => {
              try { await source.phoneLinkSet(!phoneOn); notice('Phone link is ' + (phoneOn ? 'off.' : 'on.')); } catch (e) { notice('Could not change the phone link: ' + String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')); }
            } },
            { label: 'Pair a phone…', run: async () => (await import('./phonedialog.js')).openPhoneDialog(source) });
        }
        openMenu($('shell-more'), items, { label: 'More' });
      });
      $('shell-help').addEventListener('click', () => $('help').click());
    } catch (e) {
      // Without the grid the app shows the fixed list and session view, without the in-app terminal.
      document.body.classList.remove('app-mode');
      $('shell').hidden = true;
      panels = null;
      grid = null;
      $('split').hidden = false;
      notice('The session shell could not start, so the plain list is shown: ' + (e && e.message ? e.message : e));
    }
  }

  $('add-folder').addEventListener('click', handlers.onAddFolder);
  $('empty-add').addEventListener('click', handlers.onAddFolder);
  $('help').addEventListener('click', async () => {
    try { (await import('./help.js')).openHelp(source.kind); } catch (e) { notice('Help could not open: ' + (e && e.message ? e.message : e)); }
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
      for (const [id, p] of pendingLogins) { // a sign-in that ended on an email already added
        const me = accounts.find((a) => a.id === id);
        const dup = me && me.email && duplicateAccount(accounts.filter((a) => a.id !== id), { email: me.email });
        if (dup) { pendingLogins.delete(id); notice(me.email + ' is already added as ' + dup.name + '. ' + me.name + ' repeats it; remove that folder when you are done.'); }
      }
      const groups = groupByProject(merged);
      lastUpdate = Date.now();
      $('empty').hidden = accounts.length > 0;
      (grid ? $('shell') : $('split')).hidden = accounts.length === 0;
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
      let parents = {};
      if (source.handoffLinks) {
        try { parents = await source.handoffLinks(); linkProblem = false; } catch (e) {
          if (!linkProblem) notice('Could not read which sessions are sub-sessions: ' + (e && e.message ? e.message : e));
          linkProblem = true;
        }
      }
      const listModel = { accounts: accountsNow, groups, limitsByAccount, nowMs, kind: source.kind, runningKeys: panels ? panels.runningKeys() : new Set(), parents };
      gridModel = listModel;
      if (sendTo) sendTo.observe(listModel);
      if (grid) grid.update(listModel);
      else renderList($('list'), listModel, handlers, listState);
      renderStrip($('strip'), { accounts: accountsNow, limitsByAccount, states: Object.fromEntries(accounts.map((a) => [a.id, a.reporter])), nowMs, selectedId: store('get', 'router.newSessionAccount') }, handlers);
      updateStatus();
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
