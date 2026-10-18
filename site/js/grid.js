// The app's tile grid (Windows app only), built on dockview-core. The website never loads this file.
// Pure helpers come first (tested without a browser): layout file, quick-layout plans, percentage sizes.
// createGrid() at the bottom touches the DOM. DOM is built with textContent only.
import { el, button } from './sessionview.js';
import { projectColor } from './discovery.js';
import { createProjectsTile } from './tiles/projects.js';
import { createSessionTile, sessionTileKey } from './tiles/session.js';
import { createVisualsTile } from './tiles/visuals.js';

// ---------- layout file (userData/layout.json) ----------
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const NAME_MAX = 60;

export function emptyLayoutFile() { return { version: 1, current: null, saved: [] }; }

// A dockview toJSON() result has at least a grid and a panels map.
export function isDockLayout(v) { return isObj(v) && isObj(v.grid) && isObj(v.panels); }

// raw: the object from main, or JSON text, or null (no file yet). Throws when it is text that is not JSON or not an object.
export function parseLayoutFile(raw) {
  if (raw == null || raw === '') return emptyLayoutFile();
  const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isObj(v)) throw new Error('The layout file is not an object.');
  const saved = Array.isArray(v.saved)
    ? v.saved.filter((x) => isObj(x) && typeof x.name === 'string' && x.name.trim() && isDockLayout(x.layout)).map((x) => ({ name: x.name.trim(), layout: x.layout }))
    : [];
  return { version: 1, current: isDockLayout(v.current) ? v.current : null, saved };
}

export function serializeLayoutFile(file) { return JSON.stringify(parseLayoutFile(file)); }

export function withCurrent(file, layout) {
  if (!isDockLayout(layout)) throw new Error('That is not a grid layout.');
  return { ...parseLayoutFile(file), current: layout };
}

// Saves a layout under a name; the same name (any case) is replaced.
export function withSaved(file, name, layout) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Give the layout a name.');
  if (n.length > NAME_MAX) throw new Error('Use a name of ' + NAME_MAX + ' letters or fewer.');
  if (!isDockLayout(layout)) throw new Error('That is not a grid layout.');
  const f = parseLayoutFile(file);
  const rest = f.saved.filter((s) => s.name.toLowerCase() !== n.toLowerCase());
  return { ...f, saved: [...rest, { name: n, layout }] };
}

export function withoutSaved(file, name) {
  const f = parseLayoutFile(file);
  return { ...f, saved: f.saved.filter((s) => s.name !== name) };
}

export function findSaved(file, name) {
  return parseLayoutFile(file).saved.find((s) => s.name === name) || null;
}

// ---------- sizes ----------
// Blank means "leave this one alone" (null). "30" and "30%" both mean 30. Anything else throws a message for the dialog.
export function parsePercent(text) {
  const t = String(text == null ? '' : text).trim().replace(/%$/, '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100) throw new Error('Use a number from 1 to 100, like 30.');
  return n;
}

export function percentToPx(pct, total) {
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100 || !(total > 0)) return null;
  return Math.max(1, Math.round((total * pct) / 100));
}

// widthText/heightText: what was typed. win: { width, height } in pixels. Returns { width?, height? } for dockview's setSize.
export function sizeFromPercent(widthText, heightText, win) {
  const w = parsePercent(widthText);
  const h = parsePercent(heightText);
  if (w == null && h == null) throw new Error('Enter a width, a height, or both.');
  const out = {};
  if (w != null) out.width = percentToPx(w, win.width);
  if (h != null) out.height = percentToPx(h, win.height);
  return out;
}

// ---------- quick layouts ----------
export const QUICK_LAYOUTS = [
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '2x2', label: '2x2' },
  { id: '3+1', label: '3+1' },
  { id: 'projects', label: 'Projects only' },
];

// Slots are groups to create, in order. ref = index of an earlier slot (null for the first), dir = where the new group goes
// next to it. widthPct/heightPct are applied after the groups exist.
const SLOTS = {
  '1': [{ ref: null }],
  '2': [{ ref: null, widthPct: 50 }, { ref: 0, dir: 'right', widthPct: 50 }],
  '2x2': [
    { ref: null, widthPct: 50, heightPct: 50 },
    { ref: 0, dir: 'right', widthPct: 50, heightPct: 50 },
    { ref: 0, dir: 'below', heightPct: 50 },
    { ref: 1, dir: 'below', heightPct: 50 },
  ],
  // One large tile on the left and three stacked on the right.
  '3+1': [
    { ref: null, widthPct: 60 },
    { ref: 0, dir: 'right', widthPct: 40, heightPct: 34 },
    { ref: 1, dir: 'below', heightPct: 33 },
    { ref: 2, dir: 'below', heightPct: 33 },
  ],
  projects: [{ ref: null }],
};

// tiles: [{ id, kind }] in their current order. Returns { slots, assign, active, needProjects }:
// assign[i] is the list of tile ids for slot i (tabs, first one shown), active[i] the one to show.
export function planQuickLayout(kind, tiles, activeId) {
  const slots = SLOTS[kind];
  if (!slots) throw new Error('Unknown layout ' + kind);
  const all = tiles.slice();
  const projectsTile = all.find((t) => t.kind === 'projects') || null;
  if (kind === 'projects') {
    const ids = all.filter((t) => t !== projectsTile).map((t) => t.id);
    return {
      slots,
      assign: [[...(projectsTile ? [projectsTile.id] : []), ...ids]],
      active: [projectsTile ? projectsTile.id : null],
      needProjects: !projectsTile,
    };
  }
  let ordered;
  if (kind === '1') {
    const first = all.find((t) => t.id === activeId) || projectsTile || all[0];
    ordered = first ? [first, ...all.filter((t) => t !== first)] : [];
  } else {
    ordered = projectsTile ? [projectsTile, ...all.filter((t) => t !== projectsTile)] : all;
  }
  const assign = slots.map(() => []);
  ordered.forEach((t, i) => assign[Math.min(i, slots.length - 1)].push(t.id));
  return { slots, assign, active: assign.map((a) => a[0] || null), needProjects: false };
}

// ---------- the grid (DOM) ----------
let dockLoading = null;
function loadDockview() {
  if (window['dockview-core']) return Promise.resolve(window['dockview-core']);
  if (dockLoading) return dockLoading;
  dockLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/dockview/dockview-core.js';
    s.onload = () => (window['dockview-core'] ? res(window['dockview-core']) : rej(new Error('The grid library did not load.')));
    s.onerror = () => rej(new Error('Could not load vendor/dockview/dockview-core.js (run npm install in the desktop folder).'));
    document.head.appendChild(s);
  });
  dockLoading.catch(() => { dockLoading = null; });
  return dockLoading;
}

function askDialog({ title, fields, okLabel, validate }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', 'grid-dialog');
    const form = el('form');
    form.method = 'dialog';
    form.appendChild(el('h2', '', title));
    const inputs = {};
    for (const f of fields) {
      const label = el('label', 'grid-field');
      label.appendChild(el('span', '', f.label));
      const input = el('input');
      input.type = 'text';
      input.placeholder = f.placeholder || '';
      input.value = f.value || '';
      inputs[f.name] = input;
      label.appendChild(input);
      form.appendChild(label);
    }
    const err = el('p', 'grid-error');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    const row = el('div', 'grid-dialog-actions');
    const cancel = button('Cancel', () => dlg.close());
    const ok = el('button', 'btn primary', okLabel || 'OK');
    ok.type = 'submit';
    row.append(cancel, ok);
    form.appendChild(row);
    let result = null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) values[f.name] = inputs[f.name].value;
      try {
        if (validate) validate(values);
      } catch (ex) {
        err.textContent = ex && ex.message ? ex.message : String(ex);
        return;
      }
      result = values;
      dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.showModal();
    const first = inputs[fields[0].name];
    first.focus();
  });
}

function openMenu(anchor, items) {
  const menu = el('div', 'grid-menu');
  menu.setAttribute('role', 'menu');
  const close = () => {
    menu.remove();
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onDown = (e) => { if (!menu.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  for (const it of items) {
    const b = el('button', 'grid-menu-item', it.label);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { close(); it.run(); });
    menu.appendChild(b);
  }
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 2) + 'px';
  menu.style.right = Math.max(4, Math.round(window.innerWidth - r.right)) + 'px';
  document.body.appendChild(menu);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  menu.firstChild && menu.firstChild.focus();
}

// env = { source, panels, getModel(), getHandlers(), listState, notice(text), onReporter(accountId, on), refresh(), controls }
export async function createGrid(root, env) {
  const lib = await loadDockview();
  const tiles = new Map(); // panel id -> tile ({ update(model), dispose() })
  const incoming = new Map(); // tile id -> ptyId of a running session that was moved here from another window
  const autoStart = new Set(); // new-session tile ids that start Claude as soon as they appear
  let model = env.getModel();
  let file = emptyLayoutFile();
  let ready = false; // set after the saved layout was put back; saving before that would overwrite it
  let saveTimer = null;
  let nextNew = 1;

  const host = el('div', 'grid-host');
  root.textContent = '';
  root.appendChild(host);
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const themeNow = () => (dark.matches ? lib.themeDark : lib.themeLight);

  const tileEnv = {
    source: env.source, panels: env.panels, notice: env.notice, onReporter: env.onReporter, refresh: env.refresh,
    getModel: () => model, getHandlers: env.getHandlers, listState: env.listState,
    watcher: env.visualsWatcher ? env.visualsWatcher() : null,
  };

  function buildTile(id, params, api, element) {
    const kind = params.kind || 'session';
    if (kind === 'projects' || kind === 'project') return createProjectsTile(element, params, api, tileEnv);
    if (kind === 'visuals') return createVisualsTile(element, params, api, tileEnv);
    const ptyId = incoming.get(id);
    incoming.delete(id);
    return createSessionTile(element, params, api, tileEnv, autoStart.delete(id), ptyId);
  }

  const dv = new lib.DockviewComponent(host, {
    theme: themeNow(),
    defaultTabComponent: 'tab',
    createComponent: (o) => {
      const element = el('div', 'tile');
      return {
        element,
        init(p) {
          const tile = buildTile(o.id, p.params || {}, p.api, element);
          tiles.set(o.id, tile);
          tile.update(model);
        },
        dispose() {
          const t = tiles.get(o.id);
          tiles.delete(o.id);
          if (t && t.dispose) t.dispose();
        },
      };
    },
    createTabComponent: () => {
      const element = el('div', 'tab-inner');
      const stripe = el('span', 'tab-stripe');
      stripe.setAttribute('aria-hidden', 'true');
      const label = el('span', 'tab-title');
      const x = el('button', 'tab-close', '×');
      x.type = 'button';
      x.title = 'Close tile';
      x.setAttribute('aria-label', 'Close tile');
      element.append(stripe, label, x);
      return {
        element,
        init(p) {
          const params = p.params || {};
          stripe.style.background = params.project ? projectColor(params.project) : 'var(--accent)';
          label.textContent = p.title || '';
          p.api.onDidTitleChange((ev) => { label.textContent = ev.title; });
          x.addEventListener('mousedown', (ev) => ev.stopPropagation());
          x.addEventListener('click', (ev) => { ev.stopPropagation(); p.api.close(); });
        },
      };
    },
    createRightHeaderActionComponent: (group) => {
      const b = el('button', 'group-menu-btn', '⋯');
      b.type = 'button';
      b.title = 'Tile menu';
      b.setAttribute('aria-label', 'Tile menu');
      b.setAttribute('aria-haspopup', 'menu');
      b.addEventListener('click', () => openMenu(b, [
        { label: 'Set size…', run: () => setSizeDialog(group) },
        { label: 'Move to window ▸', run: () => moveMenu(b, group) },
        { label: 'Close tile', run: () => { const p = group.activePanel; if (p) p.api.close(); } },
      ]));
      return { element: b, init() {}, dispose() {} };
    },
    createWatermarkComponent: () => {
      const element = el('div', 'tile-empty');
      element.appendChild(el('p', '', 'Empty tile. Pick a session in the Projects tile and it opens here.'));
      return { element, init() {} };
    },
  });

  // Tiles redraw their lists, which would swallow a click that is half done (dockview activates a group on mouse down), so
  // redraws wait until the mouse button is up.
  let pressed = false;
  let pendingUpdate = false;
  function updateTiles() {
    if (pressed) { pendingUpdate = true; return; }
    pendingUpdate = false;
    for (const t of tiles.values()) t.update(model);
  }
  document.addEventListener('mousedown', () => { pressed = true; }, true);
  document.addEventListener('mouseup', () => {
    pressed = false;
    if (pendingUpdate) setTimeout(updateTiles, 0);
  }, true);

  dark.addEventListener('change', () => dv.updateOptions({ theme: themeNow() }));

  // ----- tiles -----
  const idOfSession = (s) => sessionTileKey({ accountId: s.accountId, sessionId: s.id });

  function emptyGroup() { return dv.groups.find((g) => g.panels.length === 0) || null; }

  function placeNew() {
    const empty = emptyGroup();
    if (empty) return { referenceGroup: empty, direction: 'within' };
    const g = dv.activeGroup || dv.groups[0];
    return g ? { referenceGroup: g, direction: 'right' } : undefined;
  }

  function add(id, title, params) {
    const alone = dv.groups.length === 1 && dv.groups[0].panels.length === 1 && dv.groups[0].panels[0].id === 'projects' ? dv.groups[0] : null;
    const panel = dv.addPanel({ id, component: 'tile', title, params, position: placeNew() });
    // The first tile next to the list: keep the list narrow.
    if (alone) requestAnimationFrame(() => { try { alone.api.setSize({ width: 320 }); } catch (e) { console.error('could not size the list tile:', e); } });
    return panel;
  }

  function addProjects() {
    const ex = dv.getGroupPanel('projects');
    if (ex) { ex.api.setActive(); return ex; }
    return add('projects', 'Projects', { kind: 'projects' });
  }

  function openSession(s) {
    const id = idOfSession(s);
    const ex = dv.getGroupPanel(id);
    if (ex) { ex.api.setActive(); return; }
    add(id, s.title, {
      kind: 'session', accountId: s.accountId, sessionId: s.id, projectDir: s.projectDir, file: s.file,
      cwd: s.cwd, project: s.project, title: s.title, gitBranch: s.gitBranch || '',
    });
  }

  function newSession(project, cwd, accountId) {
    const id = 'new:' + Date.now().toString(36) + '-' + nextNew++;
    autoStart.add(id);
    add(id, 'New session in ' + project, { kind: 'session', accountId, sessionId: null, cwd, project, title: 'New session in ' + project, key: id });
  }

  function openProject(project) {
    const id = 'project:' + project;
    const ex = dv.getGroupPanel(id);
    if (ex) { ex.api.setActive(); return; }
    add(id, project, { kind: 'project', project });
  }

  function openVisuals(project) {
    const id = 'visuals:' + project;
    const ex = dv.getGroupPanel(id);
    if (ex) { ex.api.setActive(); return; }
    add(id, 'Visuals: ' + project, { kind: 'visuals', project });
  }

  // ----- moving tiles between windows -----
  // The tile goes to the other window's page through main; a running session keeps its process (main owns it).
  async function moveTile(panel, target) {
    const params = panel.params || {};
    const key = params.kind === 'session' ? sessionTileKey(params) : null;
    const tile = { id: panel.id, title: panel.title || '', params, ptyId: key ? env.panels.ptyIdOf(key) : null };
    try {
      await env.source.moveTile(target, tile);
    } catch (e) {
      env.notice('Could not move the tile: ' + (e && e.message ? e.message : e));
      return;
    }
    panel.api.close();
    if (key) env.panels.release(key);
  }

  async function moveMenu(anchor, group) {
    const panel = group.activePanel;
    if (!panel) return;
    let list;
    try {
      list = await env.source.windowList();
    } catch (e) {
      env.notice('Could not list the windows: ' + (e && e.message ? e.message : e));
      return;
    }
    const items = list.filter((w) => !w.self).map((w) => ({ label: 'Window ' + w.id, run: () => moveTile(panel, w.id) }));
    items.push({ label: 'New window', run: () => moveTile(panel, 'new') });
    openMenu(anchor, items);
  }

  function addIncoming(tile) {
    if (!tile || !tile.id || !tile.params) return;
    const ex = dv.getGroupPanel(tile.id);
    if (ex) { ex.api.setActive(); return; }
    if (tile.ptyId) incoming.set(tile.id, tile.ptyId);
    add(tile.id, tile.title, tile.params);
  }

  // ----- sizes -----
  async function setSizeDialog(group) {
    const r = host.getBoundingClientRect();
    const v = await askDialog({
      title: 'Set tile size',
      okLabel: 'Apply',
      fields: [
        { name: 'w', label: 'Width, % of the window', placeholder: 'for example 30' },
        { name: 'h', label: 'Height, % of the window', placeholder: 'leave blank to keep' },
      ],
      validate: (x) => { sizeFromPercent(x.w, x.h, { width: r.width, height: r.height }); },
    });
    if (v) applySize(group, v.w, v.h);
  }

  function applySize(group, wText, hText) {
    const r = host.getBoundingClientRect();
    group.api.setSize(sizeFromPercent(wText, hText, { width: r.width, height: r.height }));
  }

  // ----- quick layouts -----
  function applyQuick(kind) {
    try {
      if (kind === 'projects') addProjects();
      const list = dv.panels.map((p) => ({ id: p.id, kind: (p.params && p.params.kind) || 'session' }));
      const plan = planQuickLayout(kind, list, dv.activePanel && dv.activePanel.id);
      const old = dv.groups.slice();
      const groups = [];
      for (const slot of plan.slots) {
        groups.push(slot.ref == null ? dv.addGroup() : dv.addGroup({ referenceGroup: groups[slot.ref], direction: slot.dir }));
      }
      plan.assign.forEach((ids, i) => {
        ids.forEach((id, k) => {
          const p = dv.getGroupPanel(id);
          if (p) p.api.moveTo({ group: groups[i], index: k });
        });
      });
      for (const g of old) if (dv.groups.includes(g) && g.panels.length === 0) dv.removeGroup(g);
      plan.active.forEach((id) => { const p = id && dv.getGroupPanel(id); if (p) p.api.setActive(); });
      requestAnimationFrame(() => {
        const r = host.getBoundingClientRect();
        plan.slots.forEach((slot, i) => {
          const size = {};
          if (slot.widthPct) size.width = percentToPx(slot.widthPct, r.width);
          if (slot.heightPct) size.height = percentToPx(slot.heightPct, r.height);
          if (size.width || size.height) groups[i].api.setSize(size);
        });
      });
    } catch (e) {
      env.notice('Could not change the layout: ' + (e && e.message ? e.message : e));
    }
  }

  // ----- saving and restoring -----
  function snapshot() {
    if (!ready) return null;
    file = withCurrent(file, dv.toJSON());
    return file;
  }
  async function persist() {
    const data = snapshot();
    if (!data) return;
    try { await env.source.layoutSet(data); } catch (e) { env.notice('Could not save the layout: ' + (e && e.message ? e.message : e)); }
  }
  function scheduleSave() {
    if (!ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }

  function restore(layout) {
    try {
      dv.fromJSON(layout);
      return true;
    } catch (e) {
      env.notice('Could not put the layout back: ' + (e && e.message ? e.message : e));
      try { dv.clear(); } catch (e2) { console.error('clear failed:', e2); }
      return false;
    }
  }

  async function saveAs() {
    const v = await askDialog({
      title: 'Save this layout',
      okLabel: 'Save',
      fields: [{ name: 'name', label: 'Name', placeholder: 'for example Morning' }],
      validate: (x) => { withSaved(file, x.name, dv.toJSON()); },
    });
    if (!v) return;
    file = withSaved(file, v.name, dv.toJSON());
    drawControls(v.name.trim());
    persist();
  }

  // ----- top bar controls -----
  function drawControls(selected) {
    const c = env.controls;
    if (!c) return;
    c.textContent = '';
    const quick = el('span', 'layout-group');
    quick.setAttribute('role', 'group');
    quick.setAttribute('aria-label', 'Quick layouts');
    for (const q of QUICK_LAYOUTS) {
      const b = button(q.label, () => applyQuick(q.id), 'small');
      b.title = q.id === 'projects' ? 'Every tile becomes a tab and the project list fills the window' : 'Arrange the tiles: ' + q.label;
      quick.appendChild(b);
    }
    const saved = el('span', 'layout-group');
    saved.setAttribute('role', 'group');
    saved.setAttribute('aria-label', 'Saved layouts');
    const sel = el('select', 'layout-select');
    sel.setAttribute('aria-label', 'Saved layouts');
    sel.appendChild(el('option', '', file.saved.length ? 'Saved layouts' : 'No saved layouts'));
    sel.firstChild.value = '';
    for (const s of file.saved) {
      const o = el('option', '', s.name);
      o.value = s.name;
      if (s.name === selected) o.selected = true;
      sel.appendChild(o);
    }
    saved.append(
      sel,
      button('Apply', () => {
        const s = findSaved(file, sel.value);
        if (!s) return env.notice('Pick a saved layout first.');
        restore(s.layout) || addProjects();
      }, 'small'),
      button('Save layout…', saveAs, 'small'),
      button('Delete', () => {
        if (!sel.value) return env.notice('Pick a saved layout to delete.');
        file = withoutSaved(file, sel.value);
        drawControls();
        persist();
      }, 'small'),
    );
    const win = button('New window', () => {
      Promise.resolve(env.source.newWindow()).catch((e) => env.notice('Could not open a window: ' + (e && e.message ? e.message : e)));
    }, 'small');
    win.title = 'Open another grid window, for another monitor';
    c.append(quick, saved, win);
    c.hidden = false;
  }

  // ----- start: put the saved layout back, without starting anything -----
  try {
    file = parseLayoutFile(await env.source.layoutGet());
  } catch (e) {
    env.notice('Could not read the saved layout: ' + (e && e.message ? e.message : e));
  }
  if (file.current) restore(file.current);
  if (!dv.panels.length) addProjects();
  ready = true;
  drawControls();
  dv.onDidLayoutChange(scheduleSave);
  dv.onDidActivePanelChange((p) => {
    const params = (p && p.params) || {};
    env.listState.selectedKey = params.kind === 'session' && params.sessionId ? sessionTileKey(params) : null;
    updateTiles();
  });
  window.routerGridSnapshot = snapshot;
  if (env.source.onTileIn) {
    env.source.onTileIn(addIncoming);
    Promise.resolve(env.source.gridReady()).catch((e) => env.notice('Could not tell the app this window is ready: ' + (e && e.message ? e.message : e)));
  }

  return {
    update(m) { model = m; updateTiles(); },
    openSession, newSession, openProject, openVisuals, applyQuick, applySize,
    // For tests and the driver: the dockview component and the current layout file.
    dock: dv,
    snapshot,
  };
}
