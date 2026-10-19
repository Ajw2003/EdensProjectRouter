// Pure: the files and links a session put on screen, found in transcript entries (transcript.js output) and Show tool lines.
// An entry is { path, kind, at, sessionId } where kind is image | video | pdf | markdown | html | artifact.
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const KINDS = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', pdf: 'pdf', md: 'markdown', html: 'html', htm: 'html',
};
const ARTIFACT_RE = /https:\/\/claude\.ai\/[^\s<>"'`)\]]*artifact[^\s<>"'`)\]]*/gi;

// 'image' and so on for a file name with a wanted extension, else null (case-insensitive).
export function kindOf(path) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(path || ''));
  return m ? KINDS[m[1].toLowerCase()] || null : null;
}

const isAbs = (p) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(p);

// Resolves p against cwd, with . and .. removed. Keeps the separator style of the Windows or POSIX path it started from.
// Returns '' when neither p nor cwd is absolute.
export function resolvePath(p, cwd) {
  p = String(p || '');
  const base = String(cwd || '');
  if (!isAbs(p) && !isAbs(base)) return '';
  const full = isAbs(p) ? p : base + (/[\\/]$/.test(base) ? '' : (base.includes('\\') && !base.includes('/') ? '\\' : '/')) + p;
  const win = /^(?:[A-Za-z]:|\\\\)/.test(full);
  const sep = win ? '\\' : '/';
  const m = /^([A-Za-z]:|\\\\[^\\/]+[\\/][^\\/]+|\/)?[\\/]*([\s\S]*)$/.exec(full);
  const root = m[1] || '';
  const out = [];
  for (const part of m[2].split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return (root === '/' ? '' : root) + sep + out.join(sep);
}

const keyOfPath = (p) => (/^(?:[A-Za-z]:|\\\\)/.test(p) ? p.replace(/\//g, '\\').toLowerCase() : p);

export function artifactLinks(text) {
  const out = [];
  for (const m of String(text || '').matchAll(ARTIFACT_RE)) out.push(m[0].replace(/[.,;:!?]+$/, ''));
  return out;
}

function sortNewest(list) {
  return list.sort((a, b) => b.at - a.at || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// entries: parseTranscript().entries. opts: { cwd, sessionId }. Newest first, one per path.
export function findVisuals(entries, opts) {
  const o = opts || {};
  const found = new Map();
  const add = (path, kind, at) => {
    const k = kind === 'artifact' ? path : keyOfPath(path);
    const cur = found.get(k);
    if (!cur || at > cur.at) found.set(k, { path, kind, at: at || 0, sessionId: o.sessionId || '' });
  };
  for (const e of entries || []) {
    if (!e) continue;
    if (e.kind === 'tool' && WRITERS.has(e.name) && typeof e.path === 'string') {
      const kind = kindOf(e.path);
      if (!kind) continue;
      const full = resolvePath(e.path, o.cwd);
      if (full) add(full, kind, e.at);
    } else if (e.kind === 'claude') {
      for (const link of artifactLinks(e.text)) add(link, 'artifact', e.at);
    }
  }
  return sortNewest([...found.values()]);
}

// Joins lists from several sessions or sources: one per path, the newest wins, newest first.
export function mergeVisuals(...lists) {
  const found = new Map();
  for (const list of lists) {
    for (const v of list || []) {
      const k = v.kind === 'artifact' ? v.path : keyOfPath(v.path);
      const cur = found.get(k);
      if (!cur || v.at > cur.at) found.set(k, v);
    }
  }
  return sortNewest([...found.values()]);
}

// Show tool lines (shows.jsonl text) for one project: entries whose cwd is one of projectCwds or inside one.
// Lines that are not JSON or lack a path are counted in `bad`, never hidden.
export function parseShows(text, projectCwds) {
  const cwds = (projectCwds || []).map((c) => keyOfPath(String(c).replace(/[\\/]+$/, '')));
  const out = [];
  let bad = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { bad++; continue; }
    if (!o || typeof o.path !== 'string' || !o.path) { bad++; continue; }
    const cwd = typeof o.cwd === 'string' ? o.cwd : '';
    const ck = keyOfPath(cwd.replace(/[\\/]+$/, ''));
    if (!cwds.some((c) => ck === c || ck.startsWith(c + '/') || ck.startsWith(c + '\\'))) continue;
    const link = /^https:\/\/claude\.ai\//i.test(o.path);
    const kind = link ? 'artifact' : kindOf(o.path);
    if (!kind) continue;
    const full = link ? o.path : resolvePath(o.path, cwd);
    if (!full) continue;
    const at = Date.parse(o.at);
    out.push({ path: full, kind, at: Number.isNaN(at) ? 0 : at, sessionId: '', caption: typeof o.caption === 'string' ? o.caption : '' });
  }
  return { entries: mergeVisuals(out), bad };
}

// The address the viewer uses for a file: router-file://local/<encoded path>, with the entry's time so a rewritten file reloads.
// Must stay the same as fileUrl() in desktop/filesguard.js (a test checks).
export function routerFileUrl(absPath, at) {
  return 'router-file://local/' + encodeURIComponent(absPath) + (at ? '?v=' + at : '');
}
