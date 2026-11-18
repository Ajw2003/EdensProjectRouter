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
