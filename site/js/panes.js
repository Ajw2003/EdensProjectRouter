// The calm shell's open sessions: up to four panes side by side, each showing Terminal or Visual. Pure; the page keeps one layout
// object, replaces it with the result of these functions and saves it. A pane = { id, mode, params } where params are what the
// session tile needs to start again (account, session, folder, title).
import { panelKey } from './terminal.js';

export const MAX_PANES = 4;
export const MODES = ['terminal', 'visual'];

export function emptyLayout() { return { version: 1, panes: [], active: null, lastMode: 'terminal' }; }

// The pane id of a session: the same key the terminal panels and the list use; a session with no id yet carries its own key.
// A cloud pane (kind 'cloud') is keyed by its cloud id, the same key its list row has.
export function paneId(params) {
  if (params.kind === 'cloud') return params.cloudId ? panelKey(params.accountId, params.cloudId) : '';
  return params.sessionId ? panelKey(params.accountId, params.sessionId) : params.key || '';
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const modeOf = (m) => (MODES.includes(m) ? m : 'terminal');

// Reads what was saved; anything that is not our shape (including the old dockview layout) gives an empty layout, junk panes are dropped.
export function parseLayout(raw) {
  if (!isObj(raw) || !Array.isArray(raw.panes)) return emptyLayout();
  const panes = [];
  for (const p of raw.panes) {
    if (!isObj(p) || !isObj(p.params) || typeof p.params.accountId !== 'string') continue;
    const id = paneId(p.params);
    if (!id || panes.some((x) => x.id === id) || panes.length >= MAX_PANES) continue;
    panes.push({ id, mode: modeOf(p.mode), params: p.params });
  }
  const active = panes.some((p) => p.id === raw.active) ? raw.active : (panes.length ? panes[panes.length - 1].id : null);
  return { version: 1, panes, active, lastMode: modeOf(raw.lastMode) };
}

export const serializeLayout = (l) => JSON.stringify(parseLayout(l));

// Opens a session beside the others. A session that is already open is only made active. null when four are open and this is a new one.
export function openBeside(layout, params) {
  const id = paneId(params);
  if (layout.panes.some((p) => p.id === id)) return { ...layout, active: id };
  if (layout.panes.length >= MAX_PANES) return null;
  return { ...layout, panes: [...layout.panes, { id, mode: layout.lastMode, params }], active: id };
}

// A plain click: the session takes the place of the active pane, or opens when nothing is open.
export function openHere(layout, params) {
  const id = paneId(params);
  if (layout.panes.some((p) => p.id === id)) return { ...layout, active: id };
  const at = layout.panes.findIndex((p) => p.id === layout.active);
  if (at < 0) return openBeside(layout, params);
  const panes = layout.panes.slice();
  panes[at] = { id, mode: layout.lastMode, params };
  return { ...layout, panes, active: id };
}

export function closePane(layout, id) {
  const panes = layout.panes.filter((p) => p.id !== id);
  const active = layout.active === id ? (panes.length ? panes[panes.length - 1].id : null) : layout.active;
  return { ...layout, panes, active };
}

// Remembers the pick for this pane and for the next pane that opens.
export function setMode(layout, id, m) {
  if (!MODES.includes(m)) return layout;
  return { ...layout, lastMode: m, panes: layout.panes.map((p) => (p.id === id ? { ...p, mode: m } : p)) };
}

export function setParams(layout, id, patch) {
  return { ...layout, panes: layout.panes.map((p) => (p.id === id ? { ...p, params: { ...p.params, ...patch } } : p)) };
}
