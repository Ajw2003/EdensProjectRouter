// Pure: which of a project's sessions to show. Sessions are newest first; pins are session ids.
export const DEFAULT_COUNT = 2;
export const MIN_COUNT = 1;
export const MAX_COUNT = 20;

export function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, v));
}

// Pinned sessions first (newest first), then the newest unpinned until count is reached.
// Pinned sessions always show, even beyond count.
export function limitSessions(sessions, count, pins) {
  const list = Array.isArray(sessions) ? sessions : [];
  const n = clampCount(count === undefined ? DEFAULT_COUNT : count);
  const pinSet = new Set(Array.isArray(pins) ? pins : []);
  const pinned = list.filter((s) => pinSet.has(s.id));
  const rest = list.filter((s) => !pinSet.has(s.id));
  const shown = pinned.concat(rest.slice(0, Math.max(0, n - pinned.length)));
  return { shown, hiddenCount: list.length - shown.length };
}
