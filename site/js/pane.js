// One pane of the calm shell: a bar (Terminal | Visual switch, menu, ×) over the session tile. The tile is the existing session
// view with the terminal (tiles/session.js); the Visual side is the Visual view. Switching hides the tile and
// never stops Claude Code. DOM built with textContent only.
import { createSessionTile } from './tiles/session.js';
import { el } from './sessionview.js';
import { openMenu } from './menu.js';
import { MODES } from './panes.js';
import { createVisual } from './visual.js';
import { createContinueButton } from './continuebutton.js';
import { createCloudPane } from './cloudpane.js';

const LABELS = { terminal: 'Terminal', visual: 'Visual' };
const msg = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

// pane = { id, mode, params }. env = { tileEnv, getSendTo(), getAsk(), onMode(mode), onClose(), onParams(patch), onFocus(), startNow, ptyId }
export function createPane(root, pane, env) {
  if (pane.params.kind === 'cloud') return createCloudPane(root, pane, { ...env, ...env.cloud, notice: env.tileEnv.notice });
  const params = { ...pane.params };
  let title = params.title || '';
  const section = el('section', 'pane');
  section.setAttribute('aria-label', 'Session: ' + title);
  const bar = el('div', 'pane-bar');
  const sw = el('div', 'pane-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'View for ' + title);
  const buttons = {};
  for (const m of MODES) {
    const b = el('button', 'pane-mode', LABELS[m]);
    b.type = 'button';
    b.addEventListener('click', () => show(m, true));
    buttons[m] = b;
    sw.appendChild(b);
  }
  const grow = el('span', 'pane-grow');
  const menu = el('button', 'pane-btn', '⋯');
  menu.type = 'button';
  menu.title = 'Session menu';
  menu.setAttribute('aria-label', 'Session menu');
  menu.setAttribute('aria-haspopup', 'menu');
  menu.addEventListener('click', openPaneMenu);
  const close = el('button', 'pane-btn', '×');
  close.type = 'button';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close ' + title);
  close.addEventListener('click', () => env.onClose());
  const cont = createContinueButton(() => tile, () => env.tileEnv.getModel(), env.tileEnv.notice);
  const cont2 = createContinueButton(() => tile, () => env.tileEnv.getModel(), env.tileEnv.notice);
  bar.append(sw, grow, cont.el, menu, close);
  const tileEl = el('div', 'pane-tile');
  const visual = el('div', 'pane-visual');
  const chat = el('div', 'pane-chat');
  visual.append(cont2.el, chat);
  section.append(bar, tileEl, visual);
  section.addEventListener('mousedown', () => env.onFocus(), true);
  section.addEventListener('focusin', () => env.onFocus());
  root.appendChild(section);

  // The tile expects dockview's api for the title and the account; the pane keeps both.
  const api = {
    get title() { return title; },
    setTitle(t) { title = t; section.setAttribute('aria-label', 'Session: ' + t); close.setAttribute('aria-label', 'Close ' + t); },
    updateParameters(patch) { Object.assign(params, patch); env.onParams(patch); },
  };
  const tile = createSessionTile(tileEl, params, api, env.tileEnv, env.startNow, env.ptyId);

  let viz = null;
  function show(mode, user) {
    pane.mode = mode;
    tileEl.hidden = mode !== 'terminal';
    visual.hidden = mode !== 'visual';
    for (const m of MODES) buttons[m].setAttribute('aria-pressed', String(m === mode));
    if (viz) viz.setVisible(mode === 'visual');
    if (user) env.onMode(mode);
  }
  viz = createVisual(chat, tile, env.tileEnv, { openTerminal: () => show('terminal', true) });
  show(pane.mode, false);

  // Send to, Ask another session and the Show tool; the account is the pill on the tile, close is ×.
  async function openPaneMenu() {
    const info = tile.info();
    const items = [];
    if (info.sessionId && env.getSendTo()) items.push({ label: 'Send to…', run: () => env.getSendTo().open(menu, { kind: 'conversation', accountId: info.accountId, id: info.sessionId }) });
    if (info.cwd && env.getAsk()) items.push({ label: 'Ask another session…', run: () => env.getAsk().open({ tileId: pane.id, accountId: info.accountId, id: info.sessionId, cwd: info.cwd, title }) });
    try {
      const on = (await env.tileEnv.source.showToolState(info.accountId)) === 'on';
      items.push({ label: (on ? 'Turn off' : 'Turn on') + ' Show tool', detail: 'Lets Claude show pictures and pages', run: () => env.tileEnv.source.setShowTool(info.accountId, !on).catch((e) => env.tileEnv.notice('Could not change the Show tool: ' + msg(e))) });
    } catch (e) { env.tileEnv.notice('Could not check the Show tool: ' + msg(e)); }
    items.push({ label: 'Details', detail: 'Account, use, model, folder', run: () => openSide(() => viz.openDetails()) });
    items.push({ label: 'Files', detail: 'What this session changed or made', run: () => openSide(() => viz.openFiles()) });
    items.push({ label: 'Pages', detail: 'Every page, diagram and picture from ' + params.project, run: () => openSide(() => viz.openShelf().catch((e) => env.tileEnv.notice('Could not list the pages: ' + msg(e)))) });
    items.push({ label: 'Close', run: () => env.onClose() });
    openMenu(menu, items, { label: 'Session menu' });
  }

  // The side panel lives in the Visual view; opening it switches the pane to Visual.
  function openSide(fn) { show('visual', true); fn(); }

  return {
    el: section,
    tile,
    viz,
    // Needs-you click: show this pane as Visual with its focus card.
    showFocus() { show('visual', true); viz.showFocus(); },
    setActive(on) { section.classList.toggle('active', on); },
    update(model) { tile.update(model); cont.update(); cont2.update(); },
    dispose() { tile.dispose(); if (viz) viz.dispose(); section.remove(); },
  };
}
