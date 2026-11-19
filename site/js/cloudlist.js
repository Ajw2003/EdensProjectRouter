// Cloud sessions in the session list (issue #41). Pure helpers; main.js feeds them and shell.js/pane.js show the result.
export const CLOUD_POLL_MS = 30000;

// Reader entries for one account -> session-like objects that join groupByProject (same group as local sessions of that repository name).
export function cloudToSessions(accountId, sessions) {
  return (Array.isArray(sessions) ? sessions : []).filter((c) => c && typeof c.id === 'string').map((c) => ({
    cloud: true, id: c.id, accountId, title: c.title || 'Untitled cloud session', project: c.repoName || 'Cloud',
    lastActiveMs: Number(c.lastActiveMs) || 0, status: c.status || '', repo: c.repo || '', url: c.url || '', cwd: '',
  }));
}

// The newest local session whose project equals the cloud session's repository name; its folder is where Continue on this PC runs.
export function localCopyOf(groups, repoName) {
  if (!repoName) return null;
  const all = (groups || []).flatMap((g) => g.sessions).filter((s) => !s.cloud && s.project === repoName && s.cwd);
  all.sort((a, b) => b.lastActiveMs - a.lastActiveMs);
  return all[0] || null;
}

// Keeps one reading per account and asks again only after CLOUD_POLL_MS. get(accountIds) never waits: it returns what is cached and starts a
// background read for stale accounts; onChange runs when a read finished. A failed call keeps the earlier sessions and records the message.
export function createCloudCache(read, onChange, now = Date.now) {
  const cache = new Map(); // accountId -> { at, state, message, sessions }
  const busy = new Set();
  function ask(id) {
    busy.add(id);
    Promise.resolve().then(() => read(id)).then((r) => {
      const prev = cache.get(id);
      cache.set(id, { at: now(), state: (r && r.state) || 'error', message: (r && r.message) || '', sessions: r && Array.isArray(r.sessions) ? r.sessions : (prev ? prev.sessions : []) });
    }, (e) => {
      const prev = cache.get(id);
      cache.set(id, { at: now(), state: 'error', message: String((e && e.message) || e), sessions: prev ? prev.sessions : [] });
    }).then(() => { busy.delete(id); onChange(); });
  }
  return {
    get(ids) {
      for (const id of ids) {
        const c = cache.get(id);
        if (!busy.has(id) && (!c || now() - c.at >= CLOUD_POLL_MS)) ask(id);
      }
      const sessions = [];
      const states = {};
      for (const id of ids) {
        const c = cache.get(id);
        if (!c) continue;
        states[id] = { state: c.state, message: c.message };
        sessions.push(...cloudToSessions(id, c.sessions));
      }
      return { sessions, states };
    },
  };
}
