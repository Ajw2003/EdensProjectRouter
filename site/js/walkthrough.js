// First-run walkthrough: three full-screen steps that replace the board until done.
import { renderBoard } from './board.js';
import { parseSession, groupByProject } from './discovery.js';
import { readingFromStatus, accountLimits } from './limits.js';

export const STEP_COUNT = 3;
export const NO_PROJECTS_TEXT = "That folder has no projects folder inside, so it isn't a Claude folder. Pick the folder named .claude";

export function clampStep(i) { return Math.max(0, Math.min(STEP_COUNT - 1, i)); }
export function stepLabel(i) { return 'Step ' + (clampStep(i) + 1) + ' of ' + STEP_COUNT; }
export function sessionCountText(n) { return n + (n === 1 ? ' session' : ' sessions'); }

// Turns an addAccount() result into {kind:'added'|'cancelled'|'error', account?, text?}.
export function addResultInfo(r) {
  if (r == null) return { kind: 'cancelled' };
  if (r.error === 'no-projects') return { kind: 'error', text: NO_PROJECTS_TEXT };
  if (r.error) return { kind: 'error', text: r.message || 'Could not add that folder: ' + r.error };
  return { kind: 'added', account: r };
}

// Plain-words result of a Turn on attempt: err is an Error/string or null, state is reporterState().
export function reporterResultText(err, state) {
  if (err) return "Couldn't turn it on: " + (err && err.message ? err.message : err);
  return state === 'on' ? 'On' : 'Not on yet';
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label, onClick, cls) {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function setDone() {
  try { localStorage.setItem('router.walkthroughDone', '1'); } catch (e) { /* private mode: it will show again next time */ }
}

const HIDE = ['.top', '#notice', 'main'];
function setBoardHidden(h) {
  for (const s of HIDE) {
    const n = document.querySelector(s);
    if (!n) continue;
    if (s === '#notice') { if (h) n.hidden = true; } else n.hidden = h;
  }
}

async function sessionCount(source, id) {
  try { return (await source.listSessionFiles(id)).length; } catch (e) { return 0; }
}

async function exampleModel(source) {
  const nowMs = Date.now();
  try {
    for (const a of await source.listAccounts()) {
      if (a.needsPermission) continue;
      const files = await source.listSessionFiles(a.id);
      if (!files.length) continue;
      files.sort((x, y) => y.mtimeMs - x.mtimeMs);
      const f = files[0];
      const r = await source.readSessionText(a.id, f.project, f.file);
      const s = parseSession(r.text, { accountId: a.id, file: f.file, project: f.project, mtimeMs: f.mtimeMs, wasCut: r.wasCut, joinLine: r.joinLine });
      const rds = [];
      for (const st of await source.readStatus(a.id)) { const rd = readingFromStatus(st, a.id); if (rd) rds.push(rd); }
      const lim = accountLimits(rds, nowMs);
      return { accounts: [{ id: a.id, name: a.name }], groups: groupByProject([s]), limitsByAccount: { [a.id]: lim[a.id] || {} }, nowMs, kind: 'browser' };
    }
  } catch (e) { /* fall through to the sample */ }
  const s = { id: 'sample', accountId: 'sample', title: 'Example: fix the checkout bug', cwd: 'C:\\Users\\you\\code\\my-project', project: 'my-project', lastActiveMs: nowMs - 180000, contextPct: 46 };
  return {
    accounts: [{ id: 'sample', name: '.claude' }], groups: groupByProject([s]), nowMs, kind: 'browser',
    limitsByAccount: { sample: { fiveHourPct: 34, fiveHourResetsAt: nowMs + 2 * 3600e3, weeklyPct: 52, weeklyResetsAt: nowMs + 3 * 86400e3 } },
  };
}

export function install(source) {
  let root = null;
  let dismissed = false;

  function close(done) {
    if (done) setDone();
    dismissed = true;
    if (root) { root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
    setBoardHidden(false);
    window.dispatchEvent(new Event('router:refresh'));
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(false); } }

  async function open() {
    if (root) return;
    root = el('section', 'walk');
    root.setAttribute('aria-label', 'First-run walkthrough');
    document.body.appendChild(root);
    setBoardHidden(true);
    document.addEventListener('keydown', onKey);
    await show(0);
  }

  async function show(i) {
    if (!root) return;
    i = clampStep(i);
    const panel = el('div', 'walk-panel');
    const top = el('div', 'walk-top');
    top.appendChild(el('p', 'walk-step', stepLabel(i)));
    top.appendChild(btn('Skip', () => close(false), 'small'));
    panel.appendChild(top);
    const h = el('h2', 'walk-title');
    h.tabIndex = -1;
    panel.appendChild(h);
    const body = el('div', 'walk-body');
    panel.appendChild(body);
    const nav = el('div', 'walk-nav');
    if (i > 0) nav.appendChild(btn('Back', () => show(i - 1)));
    if (i < STEP_COUNT - 1) nav.appendChild(btn('Next', () => show(i + 1), 'primary'));
    else nav.appendChild(btn('Finish', () => close(true), 'primary'));
    panel.appendChild(nav);
    root.textContent = '';
    root.appendChild(panel);
    h.focus();
    if (i === 0) await stepFolders(h, body);
    else if (i === 1) await stepRead(h, body);
    else await stepLimits(h, body);
  }

  async function stepFolders(h, body) {
    const desktop = source.kind === 'desktop';
    h.textContent = desktop ? 'I found these Claude folders' : 'Show me your Claude folders';
    const list = el('ul', 'walk-list');
    const msg = el('p', 'walk-error');
    msg.setAttribute('role', 'alert');
    msg.hidden = true;
    async function fill() {
      list.textContent = '';
      const accts = await source.listAccounts();
      if (!accts.length && desktop) list.appendChild(el('li', '', 'No Claude folders found yet.'));
      for (const a of accts) {
        const n = a.needsPermission ? null : await sessionCount(source, a.id);
        list.appendChild(el('li', '', '\u2713 ' + a.name + (n == null ? ' (needs access)' : ' \u00b7 ' + sessionCountText(n))));
      }
    }
    if (desktop) {
      body.appendChild(el('p', '', 'Each Claude account keeps its sessions in its own folder. These are the ones on this computer.'));
      body.appendChild(list);
      body.appendChild(msg);
      body.appendChild(btn('Look again', async () => {
        try { await source.addAccount(); msg.hidden = true; } catch (e) { msg.textContent = 'Could not look again: ' + e; msg.hidden = false; }
        await fill();
      }));
    } else {
      body.appendChild(el('p', '', 'Each Claude account keeps its sessions in its own folder. The usual one is C:\\Users\\<you>\\.claude. Other accounts are often named .claude-something, in the same place.'));
      body.appendChild(btn('Add a Claude folder', async () => {
        msg.hidden = true;
        let info;
        try { info = addResultInfo(await source.addAccount()); } catch (e) { info = { kind: 'error', text: 'Could not add the folder: ' + e }; }
        if (info.kind === 'error') { msg.textContent = info.text; msg.hidden = false; }
        await fill();
      }, 'primary'));
      body.appendChild(msg);
      body.appendChild(list);
    }
    await fill();
  }

  async function stepRead(h, body) {
    h.textContent = 'How to read the board';
    body.appendChild(el('p', '', 'Here is one session card, just like the ones on your board.'));
    const demo = el('div', 'walk-example');
    body.appendChild(demo);
    const ul = el('ul', 'walk-list plain');
    for (const t of [
      'The coloured stripe is one project.',
      'The tag is which Claude folder the session is in.',
      'Context is how full this session\u2019s memory is.',
      '5-hour and Weekly are that account\u2019s limits, with when they reset.',
      'Blue is under 70, amber is 70 to 89, red is 90 and above.',
    ]) ul.appendChild(el('li', '', t));
    body.appendChild(ul);
    renderBoard(demo, await exampleModel(source), {}, { force: true });
  }

  async function stepLimits(h, body) {
    h.textContent = 'Turn on limit tracking (optional)';
    body.appendChild(el('p', '', 'Claude Code only shows your 5-hour and weekly limits to its status line, so the board cannot see them on its own. Turning this on backs up the folder\u2019s settings.json and adds a small reporter that saves those numbers. Your existing status line keeps working, and Turn off puts everything back the way it was.'));
    const list = el('ul', 'walk-list');
    body.appendChild(list);
    const accts = await source.listAccounts();
    if (!accts.length) list.appendChild(el('li', '', 'Add a Claude folder first (step 1), or do this later from the board.'));
    for (const a of accts) {
      const li = el('li', 'walk-acct');
      li.appendChild(el('span', '', a.name));
      const res = el('span', 'walk-result', '');
      res.setAttribute('aria-live', 'polite');
      const showState = async (err) => {
        let st = 'off';
        try { st = await source.reporterState(a.id); } catch (e) { err = err || e; }
        res.textContent = reporterResultText(err, st);
        res.classList.toggle('bad', !!err);
      };
      if (a.needsPermission) res.textContent = 'Needs access first'; else await showState(null);
      li.appendChild(btn('Turn on', async () => {
        let err = null;
        try { await source.setReporter(a.id, true); } catch (e) { err = e; }
        await showState(err);
      }));
      li.appendChild(res);
      list.appendChild(li);
    }
  }

  // Auto-start calls (no argument) stay closed after Skip; the Help button passes {help:true} to reopen.
  window.routerWalkthrough = (opts) => {
    if (opts && opts.help) dismissed = false;
    if (dismissed) return;
    open();
  };
}
