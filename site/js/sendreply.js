// Pure parts of "Send a page's copied reply to the session that made it" (no DOM, no desktop bridge).
export const QUIET_MS = 1500;
export const QUIET_CAP_MS = 20000;
const COPY_MAX = 200000;

// The session whose transcript wrote the page: entry = { sessionId, accountId, at } (or a list of them), sessions = [{ accountId, id, ... }].
// With several candidates the newest one wins. Returns the session or null.
export function sessionForPage(entry, sessions) {
  const list = Array.isArray(entry) ? entry.slice() : entry ? [entry] : [];
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const e of list) {
    if (!e || !e.sessionId) continue;
    const s = (sessions || []).find((x) => x.id === e.sessionId && (!e.accountId || x.accountId === e.accountId));
    if (s) return s;
  }
  return null;
}

// What to type for copied text: no Enter at the end, and nothing that would press it or drive the terminal in the middle.
// Line breaks inside stay as line feeds; other control characters are dropped.
export function textToType(text) {
  let t = String(text == null ? '' : text).slice(0, COPY_MAX).replace(/\r\n?/g, '\n');
  t = t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  return t.replace(/\s+$/, '');
}

// Waits until lastAt() (ms of the last output, or null) is quietMs old, or capMs have passed since the start.
// env = { now(), sleep(ms) }. Resolves 'quiet' or 'cap'. Output that never came counts from the start of the wait.
export async function waitQuiet(lastAt, env, opts = {}) {
  const quietMs = opts.quietMs == null ? QUIET_MS : opts.quietMs;
  const capMs = opts.capMs == null ? QUIET_CAP_MS : opts.capMs;
  const pollMs = opts.pollMs || 100;
  const start = env.now();
  for (;;) {
    const now = env.now();
    if (now - start >= capMs) return 'cap';
    const last = Math.max(lastAt() || 0, start);
    if (now - last >= quietMs) return 'quiet';
    await env.sleep(pollMs);
  }
}

export function confirmation(title) { return 'Typed into ' + title + '. Press Enter there to send.'; }
