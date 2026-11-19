// Pure: what the Visual view's chat cards, Files panel and Pages shelf are made of. No DOM.
import { kindOf, resolvePath, routerFileUrl } from './visualsfind.js';

export const KIND_LABEL = { image: 'Picture', video: 'Video', pdf: 'PDF', markdown: 'Markdown', html: 'Page', artifact: 'Claude artifact' };
const basename = (p) => String(p).replace(/\\/g, '/').split('/').pop();

// A 'visual' event (path as Claude wrote it) -> { path (absolute), kind, name, url }, or null when it cannot be resolved or shown.
export function visualItem(ev, cwd) {
  const kind = kindOf(ev && ev.path);
  const path = kind ? resolvePath(ev.path, cwd) : '';
  return path ? { path, kind, name: basename(path), url: routerFileUrl(path) } : null;
}

// Files the session changed or made, newest change last in each list: [{ path, name, changes: [{ id, tool, summary, edits: [{ before, after }] }] }],
// ordered by their latest change, newest first.
export function filesFromEvents(events) {
  const by = new Map();
  let n = 0;
  for (const e of events || []) {
    if (e.kind !== 'action' || !e.path || !Array.isArray(e.edits)) continue;
    if (!by.has(e.path)) by.set(e.path, { path: e.path, name: basename(e.path), changes: [], last: 0 });
    const f = by.get(e.path);
    f.changes.push({ id: e.id, tool: e.name, summary: e.summary, edits: e.edits });
    f.last = ++n;
  }
  return [...by.values()].sort((a, b) => b.last - a.last).map(({ last, ...f }) => f);
}

// Line-by-line difference between two texts for the Files panel: [{ op: ' ' | '-' | '+', text }].
// Longest common subsequence on lines; past LIMIT lines a side it shows all of before as removed and all of after as added.
const DIFF_LIMIT = 600;
export function lineDiff(before, after) {
  const a = before ? String(before).split('\n') : [];
  const b = after ? String(after).split('\n') : [];
  if (a.length > DIFF_LIMIT || b.length > DIFF_LIMIT) return [...a.map((text) => ({ op: '-', text })), ...b.map((text) => ({ op: '+', text }))];
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: ' ', text: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: a[i++] });
    else out.push({ op: '+', text: b[j++] });
  }
  while (i < n) out.push({ op: '-', text: a[i++] });
  while (j < m) out.push({ op: '+', text: b[j++] });
  return out;
}
