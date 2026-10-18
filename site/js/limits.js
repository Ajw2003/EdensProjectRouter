// Pure: status JSON -> limit readings; account "most room" ordering.

function pct(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}
function resetMs(v) {
  return typeof v === "number" && isFinite(v) ? v * 1000 : null; // resets_at is epoch seconds
}

export function readingFromStatus(json, accountId) {
  if (!json || typeof json !== "object") return null;
  const rl = json.rate_limits || {};
  const fh = rl.five_hour || {};
  const sd = rl.seven_day || {};
  return {
    sessionId: json.session_id ?? null,
    accountId,
    fiveHourPct: pct(fh.used_percentage),
    fiveHourResetsAt: resetMs(fh.resets_at),
    weeklyPct: pct(sd.used_percentage),
    weeklyResetsAt: resetMs(sd.resets_at),
    contextPct: pct(json.context_window && json.context_window.used_percentage),
    repoName: (json.workspace && json.workspace.repo && json.workspace.repo.name) ?? null,
    savedAtMs: typeof json.savedAtMs === "number" ? json.savedAtMs : 0,
  };
}

// Returns { [accountId]: reading } using the newest reading that still has a window in the future.
// Windows whose reset time has passed are cleared to null.
export function accountLimits(readings, nowMs) {
  const out = {};
  const sorted = [...(readings || [])].filter(Boolean).sort((a, b) => b.savedAtMs - a.savedAtMs);
  for (const r of sorted) {
    if (out[r.accountId]) continue;
    const fhOk = r.fiveHourPct !== null && r.fiveHourResetsAt !== null && r.fiveHourResetsAt > nowMs;
    const wkOk = r.weeklyPct !== null && r.weeklyResetsAt !== null && r.weeklyResetsAt > nowMs;
    if (!fhOk && !wkOk) continue;
    out[r.accountId] = {
      ...r,
      fiveHourPct: fhOk ? r.fiveHourPct : null,
      fiveHourResetsAt: fhOk ? r.fiveHourResetsAt : null,
      weeklyPct: wkOk ? r.weeklyPct : null,
      weeklyResetsAt: wkOk ? r.weeklyResetsAt : null,
    };
  }
  return out;
}

// Lowest 5-hour % first, then lowest weekly %, no reading last, ties by name.
export function orderByRoom(accounts, limitsByAccount) {
  const lim = limitsByAccount || {};
  const key = (a) => {
    const l = lim[a.id];
    return l ? [0, l.fiveHourPct ?? Infinity, l.weeklyPct ?? Infinity] : [1, 0, 0];
  };
  return [...accounts].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}
