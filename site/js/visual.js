// The Visual side of a pane: the session as a chat (history, then live), one-line action cards, question and permission
// cards, and a reply box. Everything you tap is typed into the terminal as keys. DOM built with textContent only.
import { el, button, barsNode } from './sessionview.js';
import { accountLabel } from './accounts.js';
import { taskSteps, openQuestion, questionText, whereYouWere, showWhere } from './calm.js';
import { appendVisual, newVisualState } from './visualevents.js';
import { createSide } from './visualside.js';
import { visualItem, filesFromEvents } from './visualpanels.js';
import { loadProjectVisuals } from './shelf.js';
import { buildCards, tappable, isSuggested, optionKeys, ownAnswerKeys, permissionKeys, permissionText, keysForMessage, keysEsc, pathToType } from './visualcards.js';

const POLL_MS = 1500;
const msg = (e) => String(e && e.message ? e.message : e);

// tile = the pane's session tile (info(), ensureRunning()); env = the tile env ({ source, panels, notice, calm() }).
// hooks = { openTerminal() }.
export function createVisual(root, tile, env, hooks = {}) {
  const sw = () => (env.calm ? env.calm().switches : { why: true, actions: true, results: false, tasks: true, pictures: true, artifacts: true, where: true });
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
  const toggled = new Map(); // action id -> expanded by hand; untouched ones open only when Raw results is on
  let asideKey = ''; // the focus card you put aside
  let focusSig = '';
  let wyw = null; // the Where-you-were card: undecided (null), shown ({goal, last}) or dismissed (false)

  const log = el('div', 'vz-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Conversation');
  log.tabIndex = 0;
  const live = el('div', 'vz-live');
  const strip = el('div', 'vz-strip');
  strip.hidden = true;
  const whereEl = el('div', 'vz-where');
  whereEl.hidden = true;
  const focus = el('div', 'vz-focus');
  focus.hidden = true;
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
  const col = el('div', 'vz-col');
  col.append(whereEl, strip, log, fresh, live, reply, focus);
  const sideEl = el('div');
  root.append(col, sideEl);

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
  const side = createSide(sideEl, { source: env.source, notice: env.notice, typeKeys });
  let rooted = false; // router-file:// serves only folders a listing has registered
  async function registerRoots() {
    const i = tile.info();
    if (rooted || !i.file) return;
    rooted = true;
    try { await env.source.listVisuals(i.accountId, { name: i.project, sessions: [{ id: i.sessionId, projectDir: i.projectDir, file: i.file, cwd: i.cwd }] }); } catch (e) { rooted = false; console.error('could not register the project folder for pictures:', e); }
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
    let k = tile.info().key;
    if (!env.panels.isRunning(k)) {
      // Join or start the session first, as typing does: a phone in Visual mode has not joined the PC's terminal yet.
      await tile.ensureRunning();
      k = tile.info().key;
      if (!env.panels.isRunning(k)) return null;
      await env.panels.whenQuiet(k, 800, 8000);
    }
    const ptyId = env.panels.ptyIdOf && env.panels.ptyIdOf(k);
    if (ptyId && env.source.ptyScreen) return env.source.ptyScreen(ptyId); // main's copy, at the pty's own size
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
    const on = toggled.has(c.id) ? toggled.get(c.id) : sw().results;
    b.setAttribute('aria-expanded', String(on));
    b.append(el('span', 'vz-caret', on ? '▾' : '▸'), el('span', 'vz-sum', ' ' + c.summary));
    if (c.added || c.removed) b.appendChild(el('span', 'vz-diff', '+' + c.added + ' −' + c.removed));
    if (c.done) { const ok = el('span', 'vz-ok', '✓'); ok.setAttribute('aria-label', 'done'); b.appendChild(ok); }
    const d = el('div', 'vz-detail');
    d.hidden = !on;
    if (c.why && sw().why) d.appendChild(el('p', 'vz-why', 'Why: ' + c.why));
    if (c.path) d.appendChild(el('p', 'vz-path', c.path));
    const res = el('pre', 'vz-result', c.result === null ? 'Running…' : (c.result || '(no output)'));
    if (sw().results) d.appendChild(res);
    else { const f = el('details', 'vz-fold'); f.append(el('summary', '', 'Raw result'), res); d.appendChild(f); } // long output stays folded
    b.addEventListener('click', () => {
      const now = d.hidden;
      d.hidden = !now;
      b.setAttribute('aria-expanded', String(now));
      b.firstChild.textContent = now ? '▾' : '▸';
      toggled.set(c.id, now);
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

  // A picture or page the session made, at a fixed size so nothing jumps when it loads. Nothing autoplays.
  function visualNode(c) {
    const item = visualItem(c, tile.info().cwd);
    const wrap = el('div', 'vz-card vz-visual');
    if (!item) { wrap.appendChild(el('p', 'st-note', 'Could not place ' + c.path + '.')); return wrap; }
    const thumb = el('div', 'vz-thumb');
    if (item.kind === 'image') {
      const img = el('img');
      img.alt = item.name;
      img.src = item.url;
      img.addEventListener('error', () => { thumb.textContent = 'Picture not available'; });
      thumb.appendChild(img);
    } else thumb.textContent = item.kind === 'html' ? 'Page' : item.kind === 'markdown' ? 'Markdown' : item.kind;
    const open = button(item.kind === 'image' ? 'Open full size' : item.kind === 'html' ? 'Open page' : 'Open', () => side.openItem(item), 'small');
    open.setAttribute('aria-label', open.textContent + ': ' + item.name);
    wrap.append(thumb, el('span', 'vz-name', item.name), open);
    return wrap;
  }
  function artifactNode(c) {
    const wrap = el('div', 'vz-card vz-visual vz-artifact');
    wrap.append(el('span', 'vz-name', 'Claude artifact'), el('span', 'vz-path', c.url),
      button('Open in browser', () => side.openItem({ kind: 'artifact', path: c.url, name: 'Claude artifact' }), 'small'));
    return wrap;
  }

  function node(c) {
    if (c.kind === 'visual') return sw().pictures ? visualNode(c) : null;
    if (c.kind === 'artifact') return sw().artifacts ? artifactNode(c) : null;
    if (c.kind === 'you' || c.kind === 'claude') {
      const bubble = el('div', 'sv-bubble ' + (c.kind === 'you' ? 'sv-you' : 'sv-claude'));
      bubble.appendChild(el('span', 'sv-who', c.kind === 'you' ? 'You' : 'Claude'));
      bubble.appendChild(el('div', 'sv-text', c.text));
      return bubble;
    }
    if (c.kind === 'action') return sw().actions ? actionNode(c) : (sw().why && c.why ? el('p', 'vz-why vz-why-line', c.why) : null);
    if (c.kind === 'question') return questionNode(c);
    if (sw().tasks) return null; // the Now strip shows them
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
    let lastWhy = '';
    for (const c of cards) {
      const n = node(c);
      if (!n) continue;
      if (n.classList.contains('vz-why-line')) { if (n.textContent === lastWhy) continue; lastWhy = n.textContent; }
      log.appendChild(n);
    }
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
    live.appendChild(permCard());
  }
  function permCard() {
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
    return card;
  }

  // The Now strip: Claude's task list as a row of steps, done ones green.
  let stripSig = '';
  function drawStrip() {
    const t = sw().tasks ? taskSteps(events) : null;
    const sig = JSON.stringify(t);
    if (sig === stripSig) return;
    stripSig = sig;
    strip.textContent = '';
    strip.hidden = !t;
    if (!t) return;
    strip.setAttribute('aria-label', 'Tasks: ' + t.done + ' of ' + t.steps.length + ' done');
    for (const st of t.steps) {
      const c = el('span', 'vz-step vz-step-' + st.state, (st.state === 'done' ? '✓ ' : '') + st.text);
      if (st.state === 'now') c.setAttribute('aria-current', 'step');
      strip.appendChild(c);
    }
  }

  // The Where-you-were card: decided once, when the conversation first loads for a session that was idle.
  let wywData = null;
  let wywDecided = false;
  let wywDismissed = false;
  function drawWhere() {
    const i = tile.info();
    if (!wywDecided && events.length && i.sessionId) {
      wywDecided = true;
      const s = ((env.getModel && env.getModel().groups) || []).flatMap((g) => g.sessions).find((x) => x.accountId === i.accountId && x.id === i.sessionId);
      wywData = s && showWhere(s.lastActiveMs, Date.now()) ? whereYouWere(events, s.title) : null;
    }
    const on = !!wywData && !wywDismissed && sw().where;
    whereEl.hidden = !on;
    if (!on || whereEl.firstChild) return;
    whereEl.append(el('strong', '', 'Where you were'), el('p', 'vz-goal', 'Goal: ' + wywData.goal));
    if (wywData.last) whereEl.appendChild(el('p', 'vz-lastdone', 'Last thing: ' + wywData.last));
    const x = button('Dismiss', () => { wywDismissed = true; whereEl.hidden = true; }, 'small');
    whereEl.appendChild(x);
  }

  // The focus card: an unanswered question or a permission fills the pane until answered or put aside.
  function currentNeed() {
    if (!tile.info().running) return null;
    if (screen.kind === 'permission') return { key: 'perm:' + liveSig, kind: 'permission' };
    const q = screen.kind ? openQuestion(events) : null;
    return q ? { key: 'q:' + q.id, kind: 'question', q } : null;
  }
  function drawFocus() {
    const need = currentNeed();
    if (!need || need.key === asideKey) { focus.hidden = true; focus.textContent = ''; focusSig = ''; return; }
    if (focusSig === need.key) return; // keep what you typed
    focusSig = need.key;
    focus.textContent = '';
    focus.hidden = false;
    focus.setAttribute('role', 'dialog');
    focus.setAttribute('aria-label', 'Claude needs you');
    const head = el('div', 'vz-focus-head');
    head.append(el('strong', '', 'Claude needs you'), el('span', 'pane-grow'), button('Put aside', () => { asideKey = need.key; drawFocus(); }, 'small'));
    focus.append(head, need.kind === 'permission' ? permCard() : questionNode(need.q));
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
      if (events.some((e) => e.kind === 'visual')) await registerRoots();
      drawLog();
      lines = info.running ? env.panels.screenLines(info.key) : [];
      screen = lines.length ? await env.source.screenRead(lines) : { kind: null, options: [], selected: 0 };
      drawLive();
      drawStrip();
      drawWhere();
      drawFocus();
    } catch (e) { console.error('visual view poll failed:', e); } finally { polling = false; }
  }
  const timer = setInterval(poll, POLL_MS);

  return {
    setVisible(on) { visible = on; if (on) poll(); },
    // What to show changed: draw everything again with the new switches.
    restyle() { drawnCount = -1; stripSig = ''; whereEl.textContent = ''; drawLog(); drawStrip(); drawWhere(); },
    // Needs-you list: the open question's text as the Visual view knows it ('' when none).
    questionText() { const q = openQuestion(events); return q ? questionText(q) : ''; },
    // Opened from the Needs-you list: bring a put-aside focus card back.
    showFocus() { asideKey = ''; focusSig = ''; poll(); },
    async openDetails() {
      await poll();
      const i = tile.info();
      const m = env.getModel();
      const s = (m.groups || []).flatMap((g) => g.sessions).find((x) => x.accountId === i.accountId && x.id === i.sessionId) || {};
      const a = (m.accounts || []).find((x) => x.id === i.accountId);
      const n = el('div', 'vz-details');
      for (const [k, v] of [['Account', a ? accountLabel(a) : i.accountId], ['Model', s.model || 'not known yet'], ['Folder', i.cwd || 'not known yet'], ['Files changed', String(filesFromEvents(events).length)]]) {
        const r = el('p', 'vz-detail-row');
        r.append(el('span', 'sv-who', k), el('span', 'vz-detail-val', v));
        n.appendChild(r);
      }
      n.appendChild(barsNode({ ...s, accountId: i.accountId }, { accounts: m.accounts, limitsByAccount: m.limitsByAccount, onReporter: env.onReporter }, Date.now()));
      n.appendChild(button('Open terminal', () => { side.close(); if (hooks.openTerminal) hooks.openTerminal(); }));
      side.showNode('Details', n);
    },
    openFiles() { side.showFiles(filesFromEvents(events)); },
    async openShelf() {
      const project = tile.info().project;
      await registerRoots();
      const r = await loadProjectVisuals(env.source, env.getModel(), project);
      side.showShelf(project, r.entries.map((e) => ({ ...e })), r.problems);
    },
    dispose() { clearInterval(timer); },
  };
}
