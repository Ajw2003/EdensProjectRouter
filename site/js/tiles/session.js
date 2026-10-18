// A session tile: header (project colour stripe, title, the three bars, an "Open in Windows Terminal" icon), then the last
// 3 messages and when the session was last active with one big Resume button, and after Resume the terminal fills the tile.
// Nothing starts Claude Code until Resume is pressed (or the tile is a brand new session). DOM built with textContent only.
import { appendTranscript, newTranscriptState } from '../transcript.js';
import { relativeTime } from '../board.js';
import { projectColor } from '../discovery.js';
import { barsNode, el, button } from '../sessionview.js';
import { panelKey } from '../terminal.js';

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
  const key = sessionTileKey(params);
  const isNew = !params.sessionId;
  let session = {
    accountId: params.accountId, id: params.sessionId, projectDir: params.projectDir, file: params.file, cwd: params.cwd || '',
    project: params.project || '', title: params.title || '', gitBranch: params.gitBranch || '', contextPct: 0, lastActiveMs: 0,
  };
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

  function resume() {
    mode = 'term';
    body.hidden = true;
    term.hidden = false;
    starting = true;
    drawHead();
    env.panels.show(key, term, { sessionId: params.sessionId || null, cwd: session.cwd, accountId: session.accountId, title: session.title })
      .then(() => env.refresh())
      .catch((e) => env.notice('Could not open the terminal: ' + (e && e.message ? e.message : e)))
      .finally(() => { starting = false; if (!stopped) drawHead(); });
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
    if (acct) top.appendChild(el('span', 'tag', acct.name));
    if (mode === 'term' && !starting && !running()) top.appendChild(button(isNew ? 'Start again' : 'Resume again', resume, 'small primary'));
    const wt = el('button', 'btn icon-btn', '↗');
    wt.type = 'button';
    wt.title = 'Open in Windows Terminal';
    wt.setAttribute('aria-label', 'Open in Windows Terminal');
    wt.addEventListener('click', openInWindowsTerminal);
    top.appendChild(wt);
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
    update(model) {
      const found = (model.groups || []).flatMap((g) => g.sessions).find((s) => s.accountId === session.accountId && s.id === session.id);
      if (found) {
        session = { ...session, ...found };
        if (session.title && api.title !== session.title) api.setTitle(session.title);
      }
      drawHead();
      if (mode === 'preview') {
        if (!isNew && session.lastActiveMs !== loadedFor) loadPreview();
        else drawBody();
      }
    },
    dispose() { stopped = true; ro.disconnect(); },
  };
}
