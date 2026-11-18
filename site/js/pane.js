// One pane of the calm shell: a bar (Terminal | Visual switch, menu, ×) over the session tile. The tile is the existing session
// view with the terminal (tiles/session.js); the Visual side is a placeholder until the next step. Switching hides the tile and
// never stops Claude Code. DOM built with textContent only.
import { createSessionTile } from './tiles/session.js';
import { el } from './sessionview.js';
import { openMenu } from './menu.js';
import { MODES } from './panes.js';
import { createVisualsTile } from './tiles/visuals.js';

const LABELS = { terminal: 'Terminal', visual: 'Visual' };
const msg = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

// pane = { id, mode, params }. env = { tileEnv, getSendTo(), getAsk(), onMode(mode), onClose(), onParams(patch), onFocus(), startNow, ptyId }
export function createPane(root, pane, env) {
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
  bar.append(sw, grow, menu, close);
  const tileEl = el('div', 'pane-tile');
  const visual = el('div', 'pane-visual');
  visual.appendChild(el('p', 'st-note', 'Visual view arrives in the next step'));
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

  function show(mode, user) {
    pane.mode = mode;
    tileEl.hidden = mode !== 'terminal';
    visual.hidden = mode !== 'visual';
    for (const m of MODES) buttons[m].setAttribute('aria-pressed', String(m === mode));
    if (user) env.onMode(mode);
  }
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
    // The existing Visuals view for this project (pictures, pages, files), shown on the Visual side until the next step replaces it.
    items.push({ label: 'Visuals', detail: 'Pictures, pages and files from ' + params.project, run: openVisuals });
    items.push({ label: 'Close', run: () => env.onClose() });
    openMenu(menu, items, { label: 'Session menu' });
  }

  let visuals = null;
  function openVisuals() {
    if (!visuals) {
      visual.textContent = '';
      const t = env.tileEnv;
      visuals = createVisualsTile(visual, { kind: 'visuals', project: params.project }, api, {
        ...t, sessionTiles: env.sessionTiles, focusSession() {}, startSession() { t.notice('Start that session from the list first.'); },
        sendTo: { open: (a, src) => (env.getSendTo() ? env.getSendTo().open(a, src) : t.notice('Send to is not ready yet.')) },
      });
      visuals.update(t.getModel());
    }
    show('visual', true);
  }

  return {
    el: section,
    tile,
    setActive(on) { section.classList.toggle('active', on); },
    update(model) { tile.update(model); if (visuals) visuals.update(model); },
    dispose() { tile.dispose(); if (visuals && visuals.dispose) visuals.dispose(); section.remove(); },
  };
}
