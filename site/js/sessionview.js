// The open session: header (title, bars, buttons) and the live readable conversation. DOM built with textContent only.
// ctx = { kind, source, accounts, limitsByAccount, onCopyResume(s), onResumeHere(s), onError(msg) }; its fields may be getters.
import { appendTranscript, newTranscriptState } from './transcript.js';
import { barLevel, resetText } from './board.js';
import { projectColor } from './discovery.js';

const POLL_MS = 2000;
const WORKING_MS = 30000;
const BIG = 5 * 1024 * 1024;

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function button(label, onClick, cls) {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function bar(label, pct, resetsAt, nowMs, fallback) {
  const row = el('div', 'bar-row');
  row.appendChild(el('span', 'bar-label', label));
  if (pct == null) {
    row.appendChild(fallback);
    return row;
  }
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const rt = resetText(resetsAt, nowMs);
  row.appendChild(el('span', 'bar-val', p + '%' + (rt ? ' · ' + rt : '')));
  const track = el('div', 'track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuenow', String(p));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = el('div', 'fill ' + barLevel(p));
  fill.style.width = p + '%';
  track.appendChild(fill);
  row.appendChild(track);
  return row;
}

// The three bars (context, 5-hour limit, weekly limit) for a session. Shared by the session view and the app's session tiles.
// ctx = { accounts, limitsByAccount, onReporter(accountId, on) }
export function barsNode(session, ctx, nowMs) {
  const acct = (ctx.accounts || []).find((a) => a.id === session.accountId);
  const lim = (ctx.limitsByAccount && ctx.limitsByAccount[session.accountId]) || {};
  const turnOn = () => (acct && acct.reporter === 'on')
    ? el('span', 'bar-val', "Waiting for Claude's next reply")
    : button('Turn on limit tracking', () => ctx.onReporter && ctx.onReporter(session.accountId, true));
  const bars = el('div', 'sv-bars');
  bars.appendChild(bar('Context', session.contextPct, null, nowMs, el('span', 'bar-val', 'no reading')));
  bars.appendChild(bar('5-hour limit', lim.fiveHourPct, lim.fiveHourResetsAt, nowMs, turnOn()));
  bars.appendChild(bar('Weekly limit', lim.weeklyPct, lim.weeklyResetsAt, nowMs, turnOn()));
  return bars;
}

let current = null; // { stop() } for the open view

export function openSession(container, session, ctx) {
  if (current) current.stop();
  container.textContent = '';
  const state = newTranscriptState();
  let size = 0;
  let startByte = 0;
  let stopped = false;
  let timer = null;
  let polling = false;
  let lastAt = 0;
  let shownCount = 0;
  const open = new Set(); // tool entry indexes that are expanded

  const head = el('header', 'sv-head');
  const convo = el('div', 'sv-convo');
  convo.setAttribute('role', 'log');
  convo.setAttribute('aria-live', 'polite');
  convo.setAttribute('aria-label', 'Conversation');
  convo.tabIndex = 0;
  const earlier = el('div', 'sv-earlier');
  const list = el('div', 'sv-list');
  const msg = el('p', 'sv-msg');
  convo.append(earlier, list, msg);
  const slot = el('div');
  slot.id = 'terminal-slot';
  slot.hidden = true;
  container.append(head, convo, slot);

  function drawHead() {
    const nowMs = Date.now();
    const acct = (ctx.accounts || []).find((a) => a.id === session.accountId);
    head.textContent = '';
    head.appendChild(el('h2', '', session.title));
    const meta = el('div', 'sv-meta');
    const proj = el('span', 'sv-proj');
    const dot = el('span', 'sv-dot');
    dot.style.background = projectColor(session.project);
    dot.setAttribute('aria-hidden', 'true');
    proj.append(dot, document.createTextNode(session.project));
    meta.appendChild(proj);
    if (acct) meta.appendChild(el('span', 'tag', acct.name));
    if (session.gitBranch) meta.appendChild(el('span', 'tag', session.gitBranch));
    if (nowMs - Math.max(session.lastActiveMs || 0, lastAt) < WORKING_MS) meta.appendChild(el('span', 'sv-working', 'working now'));
    head.appendChild(meta);
    head.appendChild(barsNode(session, ctx, nowMs));
    const acts = el('div', 'card-actions');
    acts.appendChild(button('Copy resume line', () => ctx.onCopyResume ? ctx.onCopyResume(session) : null));
    if (ctx.kind === 'desktop') {
      if (ctx.onResumeHere) acts.appendChild(button('Resume here', () => ctx.onResumeHere(session), 'primary'));
      acts.appendChild(button('Open in Windows Terminal', () => {
        Promise.resolve(ctx.source.resume(session)).catch((e) => ctx.onError && ctx.onError('Could not resume: ' + e));
      }));
    }
    head.appendChild(acts);
  }

  function entryNode(e, i) {
    if (e.kind === 'tool') {
      const wrap = el('div', 'sv-tool');
      const b = el('button', 'sv-tool-row');
      b.type = 'button';
      b.setAttribute('aria-expanded', open.has(i) ? 'true' : 'false');
      b.append(el('span', 'sv-caret', open.has(i) ? '▾' : '▸'), document.createTextNode(' ' + e.summary));
      const pre = el('pre', 'sv-detail', e.detail || '(no output)');
      pre.hidden = !open.has(i);
      b.addEventListener('click', () => {
        const now = pre.hidden;
        pre.hidden = !now;
        b.setAttribute('aria-expanded', String(now));
        b.firstChild.textContent = now ? '▾' : '▸';
        if (now) open.add(i); else open.delete(i);
      });
      wrap.append(b, pre);
      return wrap;
    }
    const bubble = el('div', 'sv-bubble ' + (e.kind === 'you' ? 'sv-you' : 'sv-claude'));
    bubble.appendChild(el('span', 'sv-who', e.kind === 'you' ? 'You' : 'Claude'));
    bubble.appendChild(el('div', 'sv-text', e.text)); // white-space: pre-wrap keeps line breaks
    return bubble;
  }

  function draw() {
    const atBottom = convo.scrollHeight - convo.scrollTop - convo.clientHeight < 40;
    const es = state.entries;
    // Tool details can arrive after their row was drawn, so rows are redrawn when their detail changed.
    for (let i = 0; i < shownCount; i++) {
      const e = es[i];
      if (e.kind === 'tool' && list.children[i] && list.children[i]._detail !== e.detail) {
        const n = entryNode(e, i);
        n._detail = e.detail;
        list.replaceChild(n, list.children[i]);
      }
    }
    for (let i = shownCount; i < es.length; i++) {
      const n = entryNode(es[i], i);
      n._detail = es[i].detail;
      list.appendChild(n);
      if (es[i].at > lastAt) lastAt = es[i].at;
    }
    shownCount = es.length;
    msg.textContent = es.length ? '' : 'Nothing in this conversation yet.';
    if (state.badLines) msg.textContent += (msg.textContent ? ' ' : '') + state.badLines + ' unreadable line' + (state.badLines === 1 ? '' : 's') + ' skipped.';
    if (atBottom) convo.scrollTop = convo.scrollHeight;
  }

  async function read(fromByte) {
    return ctx.source.readTranscript(session.accountId, session.projectDir, session.file, fromByte);
  }

  async function tick(first) {
    if (stopped || polling) return;
    polling = true;
    try {
      const r = await read(first ? 0 : size);
      if (stopped) return;
      let text = r.text;
      if (first && r.size > BIG) {
        // Only the last 5 MB: re-read from there and drop the cut first line.
        startByte = r.size - BIG;
        const t = await read(startByte);
        if (stopped) return;
        const nl = t.text.indexOf('\n');
        text = nl >= 0 ? t.text.slice(nl + 1) : '';
        size = t.size;
        showEarlierButton();
      } else if (r.size < size) {
        // The file got shorter (rewritten): start over.
        resetAll();
        size = 0;
        return;
      } else {
        size = r.size;
      }
      appendTranscript(state, text);
      draw();
      drawHead();
    } catch (e) {
      if (!stopped) msg.textContent = 'Could not read this conversation: ' + (e && e.message ? e.message : e);
    } finally {
      polling = false;
    }
  }

  function resetAll() {
    Object.assign(state, newTranscriptState());
    list.textContent = '';
    shownCount = 0;
  }

  function showEarlierButton() {
    earlier.textContent = '';
    earlier.appendChild(button('Show earlier', async () => {
      earlier.textContent = 'Loading the whole conversation...';
      polling = true;
      try {
        const r = await read(0);
        resetAll();
        size = r.size;
        startByte = 0;
        appendTranscript(state, r.text);
        earlier.textContent = '';
        draw();
      } catch (e) {
        earlier.textContent = 'Could not load earlier messages: ' + (e && e.message ? e.message : e);
      } finally {
        polling = false;
      }
    }));
  }

  drawHead();
  msg.textContent = 'Loading the conversation...';
  tick(true).then(() => { convo.scrollTop = convo.scrollHeight; });
  timer = setInterval(() => tick(false), POLL_MS);
  current = {
    stop() {
      stopped = true;
      clearInterval(timer);
      if (current && current.stop === this.stop) current = null;
    },
  };
  return current;
}
