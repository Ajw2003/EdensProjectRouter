// Finds the conversation file a new tile's Claude Code wrote: the tile has no session id until Claude saves its first message.
const SLACK_MS = 5000; // the file's clock and the tile's clock are not the same
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

// Pure: the session to attach to tile ({ accountId, cwd }) or null. claimedIds: ids already open in other tiles.
export function pickNewSession(tile, sessions, claimedIds, startedAtMs) {
  const claimed = new Set(claimedIds || []);
  const cands = (sessions || []).filter((s) => !s.cloud && s.accountId === tile.accountId && (s.lastActiveMs || 0) >= startedAtMs - SLACK_MS && !claimed.has(s.id));
  const same = cands.filter((s) => norm(s.cwd) === norm(tile.cwd));
  const pool = same.length ? same : cands.length === 1 ? cands : [];
  return pool.reduce((best, s) => (!best || s.lastActiveMs > best.lastActiveMs ? s : best), null);
}
