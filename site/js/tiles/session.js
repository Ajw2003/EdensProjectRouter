// A session tile: header (project colour stripe, title, the three bars, an "Open in Windows Terminal" icon), then the last
// 3 messages and when the session was last active with one big Resume button, and after Resume the terminal fills the tile.
// Nothing starts Claude Code until Resume is pressed (or the tile is a brand new session). DOM built with textContent only.
import { appendTranscript, newTranscriptState } from '../transcript.js';
import { relativeTime } from '../board.js';
import { projectColor } from '../discovery.js';
import { barsNode, el, button } from '../sessionview.js';
import { panelKey } from '../terminal.js';
import { accountLabel, switchTargets, pendingLogins } from '../accounts.js';
import { menuButton, menuIsOpen, confirmDialog } from '../menu.js';

const PREVIEW_COUNT = 3;
const CLIP = 600;

// The terminal panel key of a tile: the list's key (account|session), or the tile's own key for a session with no id yet.
export function sessionTileKey(params) {
  return params.sessionId ? panelKey(params.accountId, params.sessionId) : params.key || '';
}

// Pure: the last n things you or Claude said (tool lines are skipped), long ones cut.
export function lastMessages(entries, n = PREVIEW_COUNT) {
  const said = (entries || []).filter((e) => e.kind === 'you' || e.kind === 'claude');
  return said.slice(-n).map((e) => ({ kind: e.kind, text: e.text.length > CLIP ? e.text.slice(0, CLIP).trimEnd() + '…' : e.text }));
}

export function lastActiveLabel(ms, nowMs) {
  return ms ? 'Last active ' + relativeTime(ms, nowMs) : 'No activity recorded yet';
}

// env = { source, panels, notice, onReporter, refresh, getModel() }. startNow: a new session that starts Claude at once.
export function createSessionTile(element, params, api, env, startNow, attachPtyId) {
  let key = sessionTileKey(params);
  const isNew = !params.sessionId;
  // A tile opened by "Add account": it runs `claude auth login` for a new folder (the app sees the id in pendingLogins).
  const login = isNew && pendingLogins.has(params.accountId) ? pendingLogins.get(params.accountId) : null;
  if (login) setTimeout(() => api.setTitle('Sign in: ' + login.name), 0); // after the tab has been built
  let session = {
    accountId: params.accountId, id: params.sessionId, projectDir: params.projectDir, file: params.file, cwd: params.cwd || '',
    project: params.project || '', title: params.title || '', gitBranch: params.gitBranch || '', contextPct: 0, lastActiveMs: 0,
  };
  if (login) session.title = 'Sign in: ' + login.name;
  let entries = [];
  let note = '';
  let loadedFor = -1;
  let mode = 'preview'; // 'preview' | 'term'
  let stopped = false;
  let starting = false;

  element.classList.add('st');
  const head = el('header', 'st-head');
  const body = el('div', 'st-body');
  const term = el('div', 'st-term');
  term.hidden = true;
  element.append(head, body, term);

  const running = () => env.panels.isRunning(key);

  // A sub-session tile has no id of its own: it runs `claude --resume <parent> --fork-session` (params.forkOf is the parent).
  const forkOf = !params.sessionId && params.forkOf ? params.forkOf : null;
  let startPromise = null;

  function resume() {
    mode = 'term';
    body.hidden = true;
    term.hidden = false;
    starting = true;
    drawHead();
    startPromise = env.panels.show(key, term, {
      sessionId: params.sessionId || forkOf || null, fork: !!forkOf, cwd: session.cwd, accountId: session.accountId, title: session.title,
    })
      .then(() => env.refresh())
      .catch((e) => env.notice('Could not open the terminal: ' + (e && e.message ? e.message : e)))
      .finally(() => { starting = false; startPromise = null; if (!stopped) drawHead(); });
    return startPromise;
  }

  // For Send to: resolves once the process is running (starting it first if it is not).
  function ensureRunning() {
    if (startPromise) return startPromise;
    return running() ? Promise.resolve() : resume();
  }

  // Waits (at most 5 s) for the stopped process to be reported as gone.
  async function waitStopped() {
    for (let i = 0; i < 50 && running(); i++) await new Promise((r) => setTimeout(r, 100));
    return !running();
  }

  // Moves this tile's session to another account: stop it if running (after asking), copy the transcript, resume there.
  async function switchTo(toId) {
    const target = (env.getModel().accounts || []).find((a) => a.id === toId);
    if (!target || toId === session.accountId) return;
    const label = accountLabel(target);
    const wasRunning = running();
    if (wasRunning && isNew) return env.notice('Stop this new session first. It has no conversation to move yet.');
    if (wasRunning) {
      const ok = await confirmDialog({
        title: 'Switch account', message: 'Stop Claude Code in this tile and continue on ' + label + '?',
        okLabel: 'Stop and continue', cancelLabel: 'Cancel',
      });
      if (!ok) return;
      try {
        const mine = (await env.source.ptyList()).filter((p) => p.sessionId === session.id);
        for (const p of mine) await env.source.ptyClose(p.ptyId);
      } catch (e) { return env.notice('Could not stop Claude Code: ' + (e && e.message ? e.message : e)); }
      if (!(await waitStopped())) return env.notice('Claude Code did not stop in 5 seconds, so the account was not changed.');
    }
    if (!isNew) {
      try {
        await env.source.copySessionTo(session.id, session.accountId, session.projectDir, toId);
      } catch (e) {
        return env.notice('Could not copy the conversation to ' + label + ', so nothing was changed: ' + (e && e.message ? e.message : e));
      }
    }
    const oldKey = key;
    session = { ...session, accountId: toId };
    key = isNew ? key : panelKey(toId, session.id);
    try { api.updateParameters({ accountId: toId }); } catch (e) { console.error('could not record the account switch:', e); }
    if (key !== oldKey) term.textContent = ''; // drop the old terminal's view; its panel stays in the app until quit
    resume();
  }

  function pill(acct) {
    const label = accountLabel(acct || { name: session.accountId });
    if (login) return el('span', 'tag acct-pill', label);
    const targets = switchTargets(env.getModel().accounts, env.getModel().limitsByAccount, session.accountId);
    return menuButton('tag acct-pill', label + ' ▾', () => (targets.length
      ? targets.map((t) => ({ label: t.label, detail: t.usage, run: () => switchTo(t.id) }))
      : [{ label: 'No other accounts', run: () => {} }]), { label: 'Account for this tile: ' + label + '. Switch to another account' });
  }

  function openInWindowsTerminal() {
    const p = isNew ? env.source.newSession(session.cwd, session.accountId) : env.source.resume(session);
    Promise.resolve(p).catch((e) => env.notice('Could not open Windows Terminal: ' + (e && e.message ? e.message : e)));
  }

  function drawHead() {
    const model = env.getModel();
    const acct = (model.accounts || []).find((a) => a.id === session.accountId);
    head.textContent = '';
    head.style.setProperty('--stripe', projectColor(session.project));
    const top = el('div', 'st-top');
    const stripe = el('span', 'st-stripe');
    stripe.setAttribute('aria-hidden', 'true');
    top.appendChild(stripe);
    top.appendChild(el('h3', 'st-title', session.title));
    top.appendChild(pill(acct));
    if (mode === 'term' && !starting && !running()) top.appendChild(button(isNew ? 'Start again' : 'Resume again', resume, 'small primary'));
    const wt = el('button', 'btn icon-btn', '↗');
    wt.type = 'button';
    wt.title = 'Open in Windows Terminal';
    wt.setAttribute('aria-label', 'Open in Windows Terminal');
    wt.addEventListener('click', openInWindowsTerminal);
    if (!forkOf) top.appendChild(wt); // the Windows Terminal button would start a plain new session, not the fork
    head.appendChild(top);
    head.appendChild(el('div', 'st-sub', session.project + (session.gitBranch ? ' · ' + session.gitBranch : '')));
    head.appendChild(barsNode(session, { accounts: model.accounts, limitsByAccount: model.limitsByAccount, onReporter: env.onReporter }, Date.now()));
  }

  function drawBody() {
    body.textContent = '';
    if (isNew) {
      body.appendChild(el('p', 'st-when', 'A new session in ' + session.project + '. Nothing has been started yet.'));
    } else {
      const list = el('div', 'st-preview');
      list.setAttribute('aria-label', 'Last messages');
      const msgs = lastMessages(entries);
      if (!msgs.length) list.appendChild(el('p', 'st-note', note || 'No messages to show yet.'));
      for (const m of msgs) {
        const b = el('div', 'st-msg ' + (m.kind === 'you' ? 'st-you' : 'st-claude'));
        b.appendChild(el('span', 'sv-who', m.kind === 'you' ? 'You' : 'Claude'));
        b.appendChild(el('div', 'st-text', m.text));
        list.appendChild(b);
      }
      body.appendChild(list);
      body.appendChild(el('p', 'st-when', lastActiveLabel(session.lastActiveMs, Date.now())));
    }
    const label = isNew ? 'Start Claude Code' : 'Resume';
    const r = button(label, resume, 'primary st-resume');
    body.appendChild(r);
  }

  async function loadPreview() {
    if (isNew || !session.file) return;
    loadedFor = session.lastActiveMs;
    try {
      const r = await env.source.readTranscript(session.accountId, session.projectDir, session.file, 0);
      if (stopped) return;
      const st = newTranscriptState();
      appendTranscript(st, r.text);
      entries = st.entries;
      note = '';
    } catch (e) {
      entries = [];
      note = 'Could not read this conversation: ' + (e && e.message ? e.message : e);
    }
    if (mode === 'preview') drawBody();
  }

  // Moved here from another window with its process still running: draw the kept output and go live.
  if (attachPtyId && !env.panels.has(key)) {
    mode = 'term';
    body.hidden = true;
    term.hidden = false;
    env.panels.attach(key, term, { ptyId: attachPtyId, title: session.title })
      .then(() => env.refresh())
      .catch((e) => env.notice('Could not show the terminal: ' + (e && e.message ? e.message : e)));
  } else
  // Back from a saved layout while the terminal still runs, or a tile reopened: show the terminal again, start nothing.
  if (env.panels.has(key)) {
    mode = 'term';
    body.hidden = true;
    term.hidden = false;
    env.panels.reattach(key, term).catch((e) => env.notice('Could not show the terminal: ' + (e && e.message ? e.message : e)));
  }

  const ro = new ResizeObserver(() => { if (mode === 'term') env.panels.fit(key); });
  ro.observe(term);

  drawHead();
  drawBody();
  loadPreview();
  if (startNow) resume();

  return {
    // For "Send to": start Claude Code in this tile if it is not already running (a running one is only focused).
    start() { resume(); },
    ensureRunning,
    info: () => ({ key, running: running(), accountId: session.accountId, sessionId: session.id || null, cwd: session.cwd, project: session.project, title: session.title }),
    update(model) {
      const found = (model.groups || []).flatMap((g) => g.sessions).find((s) => s.accountId === session.accountId && s.id === session.id);
      if (found) {
        session = { ...session, ...found };
        if (session.title && api.title !== session.title && !login) api.setTitle(session.title);
      }
      if (!menuIsOpen()) drawHead(); // a redraw would pull the pill out from under its open menu
      if (mode === 'preview') {
        if (!isNew && session.lastActiveMs !== loadedFor) loadPreview();
        else drawBody();
      }
    },
    dispose() { stopped = true; ro.disconnect(); },
  };
}
