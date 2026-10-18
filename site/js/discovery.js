// Pure session discovery: transcript text -> summary, grouping, colour, context window.

export const PALETTE = [
  '#2f7de1', '#7c5cdb', '#c04fb0', '#12a594',
  '#3a9d4f', '#1ca3c4', '#6b7fd7', '#7a8a99',
];

export function projectColor(name) {
  let h = 0x811c9dc5;
  const s = String(name);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function contextWindowFor(model, tokens) {
  if (tokens > 200000) return 1000000;
  if (String(model || '').toLowerCase().includes('1m')) return 1000000;
  return 200000;
}

function projectOf(cwd) {
  if (!cwd) return '';
  const parts = String(cwd).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function userText(msg) {
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join(' ');
  }
  return '';
}

// meta = {accountId, file, project, mtimeMs, wasCut?, joinLine?}
// wasCut: text is head + "\n" + tail. joinLine = index of the first line of the tail
// (the line after the join point). That line and the very last line may be partial and are not counted.
// If joinLine is absent, the first unparseable line is treated as the join line.
export function parseSession(text, meta) {
  const lines = String(text).split('\n');
  const cut = !!meta.wasCut;
  const lastIdx = lines.length - 1;
  let badLines = 0;
  let aiTitle = null, firstUser = null, cwd = null, gitBranch = null;
  let model = null, usage = null, lastTs = 0;
  let skippedFirstBad = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      if (cut) {
        if (i === lastIdx) continue;
        if (meta.joinLine !== undefined ? i === meta.joinLine : !skippedFirstBad) {
          skippedFirstBad = true;
          continue;
        }
      }
      badLines++;
      continue;
    }
    if (!o || typeof o !== 'object') { badLines++; continue; }
    if (o.type === 'ai-title' && o.aiTitle) aiTitle = o.aiTitle;
    if (o.type === 'user' && firstUser === null && o.isMeta !== true) {
      const t = cleanTitle(userText(o.message));
      if (t) firstUser = t;
    }
    if (o.cwd) cwd = o.cwd;
    if (o.gitBranch) gitBranch = o.gitBranch;
    if (o.timestamp) {
      const t = Date.parse(o.timestamp);
      if (!Number.isNaN(t) && t > lastTs) lastTs = t;
    }
    if (o.type === 'assistant' && o.message) {
      if (o.message.model) model = o.message.model;
      if (o.message.usage) usage = o.message.usage;
    }
  }

  const id = (meta.file || '').replace(/\.jsonl$/, '');
  const contextTokens = usage
    ? (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
    : 0;
  const contextWindow = contextWindowFor(model, contextTokens);
  return {
    id,
    accountId: meta.accountId,
    title: aiTitle || (firstUser ? firstUser.slice(0, 60) : 'Untitled session'),
    cwd: cwd || '',
    project: projectOf(cwd) || meta.project || 'Unknown',
    gitBranch: gitBranch || '',
    lastActiveMs: lastTs || meta.mtimeMs || 0,
    model: model || '',
    contextTokens,
    contextWindow,
    contextPct: Math.round((contextTokens / contextWindow) * 100),
    badLines,
  };
}

export function groupByProject(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.project)) map.set(s.project, []);
    map.get(s.project).push(s);
  }
  const groups = [];
  for (const [project, list] of map) {
    list.sort((a, b) => b.lastActiveMs - a.lastActiveMs);
    groups.push({ project, color: projectColor(project), lastActiveMs: list[0].lastActiveMs, sessions: list });
  }
  groups.sort((a, b) => b.lastActiveMs - a.lastActiveMs);
  return groups;
}
