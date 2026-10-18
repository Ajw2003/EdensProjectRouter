// Pure helpers for Send to (issue #21): the cleaned copy of a conversation, hand-off file names, @mention text, the summary
// command's arguments, and the parent/child nesting of sub-sessions. No DOM, no file access.
export const HANDOFF_DIR = '.router-handoff';
export const FORK_WINDOW_MS = 60000; // a new transcript in the project this soon after a sub-session starts is taken as its own

// Fixed brief for the Summary option. No quotes or shell characters, so it also survives a Windows .cmd launcher.
export const SUMMARY_PROMPT = 'Write a short handover summary of this conversation for a colleague who will carry on the work in another session. '
  + 'Cover the goals, the decisions made, the current state, the open problems and the key files. '
  + 'Keep it under 400 words, use Markdown headings, and do not change anything.';

// The arguments of the summary run (a read-only fork that is not saved). desktop/launch.js builds the same list; a test keeps them equal.
export function summaryArgs(sessionId) {
  return ['-p', SUMMARY_PROMPT, '--resume', sessionId, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob'];
}

const pad = (n) => String(n).padStart(2, '0');
export function dateStamp(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// Lowercase ascii letters and digits joined by single dashes, at most 50 characters, never empty.
export function slugify(title) {
  const s = String(title == null ? '' : title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 50).replace(/-+$/, '') || 'session';
}

// <yyyy-mm-dd>-<slug>.md, or -2, -3 ... before the extension when a file of that name exists (case-insensitive).
export function handoffFileName(ms, title, existing) {
  const taken = new Set([...(existing || [])].map((n) => String(n).toLowerCase()));
  const base = dateStamp(ms) + '-' + slugify(title);
  let name = base + '.md';
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = base + '-' + n + '.md';
  return name;
}

// Markdown for a conversation: a heading, then "You:" and "Claude:" blocks and one line per tool call. Tool results are left out.
// entries: parseTranscript().entries. meta: { title, project, ms, id }.
export function cleanedCopy(entries, meta) {
  const m = meta || {};
  const out = ['# ' + (m.title || 'Conversation'), ''];
  out.push('Project: ' + (m.project || 'unknown') + ' · Date: ' + dateStamp(m.ms || 0) + (m.id ? ' · Session: ' + m.id : ''), '');
  let prevTool = false;
  for (const e of entries || []) {
    if (e.kind === 'tool') {
      out.push('- ' + e.summary);
      prevTool = true;
      continue;
    }
    if (prevTool) out.push('');
    prevTool = false;
    if (e.kind === 'you') out.push('**You:**', '', e.text.trim(), '');
    else if (e.kind === 'claude') out.push('**Claude:**', '', e.text.trim(), '');
  }
  if (prevTool) out.push('');
  return out.join('\n');
}

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
const winLike = (p) => /^[A-Za-z]:/.test(p) || p.startsWith('//');

// The path of file relative to dir with forward slashes, or null when file is not inside dir.
export function relativeInside(dir, file) {
  const d = norm(dir);
  const f = norm(file);
  if (!d || !f) return null;
  const ci = winLike(d) || winLike(f);
  const a = ci ? f.toLowerCase() : f;
  const b = ci ? d.toLowerCase() : d;
  return a.startsWith(b + '/') && f.length > d.length + 1 ? f.slice(d.length + 1) : null;
}

// The text typed into a prompt to mention a file: "@path " with forward slashes, or @"path with spaces" . null if outside.
export function mentionText(targetCwd, filePath) {
  const rel = relativeInside(targetCwd, filePath);
  if (rel == null) return null;
  return /\s/.test(rel) ? '@"' + rel + '" ' : '@' + rel + ' ';
}

// Rows in display order with a depth: a session whose parent is in the list goes right after it, indented one step.
// sessions: [{ id, ... }] ; parents: { childId: parentId }.
export function nestSessions(sessions, parents) {
  const p = parents || {};
  const ids = new Set(sessions.map((s) => s.id));
  const kids = new Map();
  const roots = [];
  for (const s of sessions) {
    const par = p[s.id];
    if (par && par !== s.id && ids.has(par)) {
      if (!kids.has(par)) kids.set(par, []);
      kids.get(par).push(s);
    } else roots.push(s);
  }
  const out = [];
  const seen = new Set();
  const add = (s, depth) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ s, depth });
    for (const c of kids.get(s.id) || []) add(c, depth + 1);
  };
  for (const r of roots) add(r, 0);
  for (const s of sessions) add(s, 0); // a loop of parents: show them flat rather than lose them
  return out;
}

// A sub-session was started: pending = { parent, accountId, project, knownIds, startedMs }. Looks for the next transcript of
// that account and project that was not there at the start. -> { child } | { expired: true } | null (keep waiting)
export function matchFork(pending, sessions, nowMs) {
  const known = new Set(pending.knownIds);
  const hit = sessions.find((s) => s.accountId === pending.accountId && s.project === pending.project && s.id !== pending.parent && !known.has(s.id));
  if (hit) return { child: hit.id };
  return nowMs - pending.startedMs > FORK_WINDOW_MS ? { expired: true } : null;
}
