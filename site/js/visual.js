// The Visual side of a pane: the session as a chat (history, then live), one-line action cards, question and permission
// cards, and a reply box. Everything you tap is typed into the terminal as keys. DOM built with textContent only.
import { el, button } from './sessionview.js';
import { appendVisual, newVisualState } from './visualevents.js';
import { buildCards, tappable, isSuggested, optionKeys, ownAnswerKeys, permissionKeys, permissionText, keysForMessage, keysEsc, pathToType } from './visualcards.js';

const POLL_MS = 1500;
const msg = (e) => String(e && e.message ? e.message : e);

// tile = the pane's session tile (info(), ensureRunning()); env = the tile env ({ source, panels, notice }).
export function createVisual(root, tile, env) {
  let vstate = newVisualState();
  let events = [];
  let size = 0;
  let drawnCount = -1;
  let screen = { kind: null, options: [], selected: 0 };
  let lines = [];
  let liveSig = '';
  let visible = false;
  let stick = false; // you just sent or tapped: follow the answer even if you had scrolled up
  let polling = false;
  let note = '';
  const open = new Set(); // action ids that are expanded

  const log = el('div', 'vz-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Conversation');
  log.tabIndex = 0;
  const live = el('div', 'vz-live');
  const fresh = button('New below ↓', () => { log.scrollTop = log.scrollHeight; fresh.hidden = true; }, 'vz-new');
  fresh.hidden = true;
  const box = el('textarea', 'vz-box');
  box.rows = 2;
  box.placeholder = 'Message Claude. Type / for a command or @ for a file.';
  box.setAttribute('aria-label', 'Message Claude');
  const send = button('Send', () => sendMessage(), 'primary');
  const stop = button('Stop', () => typeKeys(keysEsc(), 'Stop'));
  const picker = el('input');
  picker.type = 'file';
  picker.multiple = true;
  picker.hidden = true;
  const attach = button('Attach', () => picker.click());
  attach.title = 'Attach files or images (their path is typed into the message)';
  const row = el('div', 'vz-reply-row');
  row.append(attach, el('span', 'pane-grow'), stop, send);
  const reply = el('div', 'vz-reply');
  reply.append(box, row, picker);
  root.classList.add('vz');
  root.append(log, fresh, live, reply);

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.addEventListener('scroll', () => { if (nearBottom()) fresh.hidden = true; });

  // Types keys into this session's terminal, starting it first when it is not running.
  async function typeKeys(keys, what) {
    try {
      let k = tile.info().key;
      if (!env.panels.isRunning(k)) {
        await tile.ensureRunning();
        k = tile.info().key;
        await env.panels.whenQuiet(k, 1500, 20000);
      }
      if (!(await env.panels.write(k, keys))) throw new Error('Claude Code is not running in this session.');
      stick = true;
      setTimeout(poll, 800);
      return true;
    } catch (e) { env.notice('Could not ' + what + ': ' + msg(e)); return false; }
  }
  async function sendMessage() {
    const text = box.value;
    if (!text.trim()) return;
    if (await typeKeys(keysForMessage(text), 'send the message')) box.value = '';
  }
  box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); sendMessage(); } });
  picker.addEventListener('change', () => {
    const paths = [];
    for (const f of picker.files) {
      const p = window.routerDesktop && window.routerDesktop.pathForFile ? window.routerDesktop.pathForFile(f) : '';
      if (p) paths.push(pathToType(p)); else env.notice('Could not find the path of ' + f.name + '.');
    }
    picker.value = '';
    if (paths.length) { box.value = (box.value ? box.value.replace(/\s*$/, ' ') : '') + paths.join(' ') + ' '; box.focus(); }
  });

  // A tap needs the screen as it is now (where the cursor is), not as it was at the last poll.
  async function freshScreen() {
    const k = tile.info().key;
    if (!env.panels.isRunning(k)) return null;
    return env.source.screenRead(env.panels.screenLines(k));
  }
  async function tap(keysFor, what) {
    try {
      const s = await freshScreen();
      const keys = s && keysFor(s);
      if (!keys) return env.notice('Claude is not showing that choice on the terminal yet. Try again in a moment, or use the Terminal view.');
      await typeKeys(keys, what);
    } catch (e) { env.notice('Could not ' + what + ': ' + msg(e)); }
  }

  function actionNode(c) {
    const wrap = el('div', 'vz-card vz-action' + (c.done ? ' vz-done' : ''));
    const b = el('button', 'vz-row');
    b.type = 'button';
    const on = open.has(c.id);
    b.setAttribute('aria-expanded', String(on));
    b.append(el('span', 'vz-caret', on ? '▾' : '▸'), el('span', 'vz-sum', ' ' + c.summary));
    if (c.added || c.removed) b.appendChild(el('span', 'vz-diff', '+' + c.added + ' −' + c.removed));
    if (c.done) { const ok = el('span', 'vz-ok', '✓'); ok.setAttribute('aria-label', 'done'); b.appendChild(ok); }
    const d = el('div', 'vz-detail');
    d.hidden = !on;
    if (c.why) d.appendChild(el('p', 'vz-why', 'Why: ' + c.why));
    if (c.path) d.appendChild(el('p', 'vz-path', c.path));
    d.appendChild(el('pre', 'vz-result', c.result === null ? 'Running…' : (c.result || '(no output)')));
    b.addEventListener('click', () => {
      const now = d.hidden;
      d.hidden = !now;
      b.setAttribute('aria-expanded', String(now));
      b.firstChild.textContent = now ? '▾' : '▸';
      if (now) open.add(c.id); else open.delete(c.id);
    });
    wrap.append(b, d);
    return wrap;
  }

  function questionNode(c) {
    const wrap = el('div', 'vz-card vz-question' + (c.answered ? ' vz-answered' : ' vz-need'));
    for (const q of c.questions) {
      if (q.header) wrap.appendChild(el('span', 'sv-who', q.header));
      wrap.appendChild(el('p', 'vz-q', q.question));
    }
    if (c.answered) { wrap.appendChild(el('p', 'vz-chosen', 'Answered: ' + c.answer)); return wrap; }
    if (!tappable(c)) { wrap.appendChild(el('p', 'st-note', 'This one has several parts. Answer it in the Terminal view.')); return wrap; }
    c.questions[0].options.forEach((o, i) => {
      const b = el('button', 'vz-opt');
      b.type = 'button';
      b.appendChild(el('span', 'vz-opt-label', o.label));
      if (isSuggested(o)) b.appendChild(el('span', 'vz-badge', 'Suggested'));
      if (o.description) b.appendChild(el('span', 'vz-opt-desc', o.description));
      b.addEventListener('click', () => tap((s) => optionKeys(i, s), 'answer'));
      wrap.appendChild(b);
    });
    const own = el('input', 'vz-own');
    own.type = 'text';
    own.placeholder = 'My own answer';
    own.setAttribute('aria-label', 'My own answer');
    const go = () => { if (own.value.trim()) tap((s) => ownAnswerKeys(own.value, s), 'answer'); };
    own.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) go(); });
    const ownRow = el('div', 'vz-own-row');
    ownRow.append(own, button('Answer', go));
    wrap.appendChild(ownRow);
    return wrap;
  }

  function node(c) {
    if (c.kind === 'you' || c.kind === 'claude') {
      const bubble = el('div', 'sv-bubble ' + (c.kind === 'you' ? 'sv-you' : 'sv-claude'));
      bubble.appendChild(el('span', 'sv-who', c.kind === 'you' ? 'You' : 'Claude'));
      bubble.appendChild(el('div', 'sv-text', c.text));
      return bubble;
    }
    if (c.kind === 'action') return actionNode(c);
    if (c.kind === 'question') return questionNode(c);
    const done = c.items.filter((t) => t.status === 'completed').length;
    return el('p', 'vz-tasks', 'Tasks: ' + done + ' of ' + c.items.length + ' done');
  }

  function drawLog() {
    if (events.length === drawnCount) return;
    const wasBottom = nearBottom();
    const top = log.scrollTop;
    const cards = buildCards(events);
    log.textContent = '';
    if (!cards.length) log.appendChild(el('p', 'st-note', note || 'Nothing in this conversation yet.'));
    for (const c of cards) log.appendChild(node(c));
    if (note && cards.length) log.appendChild(el('p', 'st-note', note));
    if (wasBottom || stick) { log.scrollTop = log.scrollHeight; stick = false; fresh.hidden = true; }
    else { log.scrollTop = top; if (drawnCount >= 0) fresh.hidden = false; } // never move a reader who scrolled up
    drawnCount = events.length;
  }

  function drawLive() {
    const sig = screen.kind === 'permission' ? JSON.stringify([screen.options, permissionText(lines)]) : '';
    if (sig === liveSig) return;
    liveSig = sig;
    live.textContent = '';
    if (!sig) return;
    const card = el('div', 'vz-card vz-need vz-perm');
    card.setAttribute('role', 'alert');
    card.appendChild(el('span', 'sv-who', 'Claude is asking permission'));
    card.appendChild(el('pre', 'vz-q', permissionText(lines) || 'Do you want to proceed?'));
    const r = el('div', 'vz-perm-row');
    r.append(
      button('Allow', () => tap((s) => permissionKeys('allow', s), 'allow'), 'primary'),
      button('Always allow in this project', () => tap((s) => permissionKeys('always', s), 'allow')),
      button('Deny', () => tap((s) => permissionKeys('deny', s), 'deny')));
    card.appendChild(r);
    live.appendChild(card);
  }

  async function poll() {
    if (!visible || polling) return;
    polling = true;
    try {
      const info = tile.info();
      if (info.file) {
        try {
          const r = await env.source.readTranscript(info.accountId, info.projectDir, info.file, size);
          if (r.size < size) { vstate = newVisualState(); events = []; size = 0; drawnCount = -1; } else { size = r.size; events.push(...appendVisual(vstate, r.text)); }
          note = vstate.badLines ? vstate.badLines + ' unreadable line' + (vstate.badLines === 1 ? '' : 's') + ' skipped.' : '';
        } catch (e) { note = 'Could not read this conversation: ' + msg(e); drawnCount = -1; }
      } else note = info.sessionId ? '' : 'This new session has no conversation file yet. It appears after your first message.';
      drawLog();
      lines = info.running ? env.panels.screenLines(info.key) : [];
      screen = lines.length ? await env.source.screenRead(lines) : { kind: null, options: [], selected: 0 };
      drawLive();
    } catch (e) { console.error('visual view poll failed:', e); } finally { polling = false; }
  }
  const timer = setInterval(poll, POLL_MS);

  return {
    setVisible(on) { visible = on; if (on) poll(); },
    dispose() { clearInterval(timer); },
  };
}
