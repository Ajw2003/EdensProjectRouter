// Pure: transcript text (JSON lines) -> readable entries, oldest first.
import { cleanTitle } from './titles.js';

const DETAIL_MAX = 4096;
const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');

export function toolSummary(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit':
      return 'Edited ' + base(i.file_path || i.notebook_path);
    case 'Bash': return 'Ran ' + String(i.command || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    case 'Read': return 'Read ' + base(i.file_path);
    case 'Grep': case 'Glob': return 'Searched ' + String(i.pattern || '');
    default: return String(name || 'Tool');
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
  return '';
}

function youText(raw) {
  if (raw.includes('<command-name>')) return cleanTitle(raw, 100000);
  if (cleanTitle(raw, 100000) === '') return '';
  return raw.trim();
}

export function newTranscriptState() {
  return { entries: [], badLines: 0, rest: '', tools: new Map() };
}

function addLine(st, line) {
  line = line.trim();
  if (!line) return;
  let o;
  try { o = JSON.parse(line); } catch (e) { st.badLines++; return; }
  if (!o || typeof o !== 'object') { st.badLines++; return; }
  const t = Date.parse(o.timestamp);
  const at = Number.isNaN(t) ? 0 : t;
  const c = o.message && o.message.content;
  if (o.type === 'user') {
    if (o.isMeta === true) return;
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b && b.type === 'tool_result') {
          const e = st.tools.get(b.tool_use_id);
          if (e) e.detail = textOf(b.content).slice(0, DETAIL_MAX);
        }
      }
    }
    const raw = Array.isArray(c) ? textOf(c) : (typeof c === 'string' ? c : '');
    const text = raw ? youText(raw) : '';
    if (text) st.entries.push({ kind: 'you', text, at });
  } else if (o.type === 'assistant' && Array.isArray(c)) {
    for (const b of c) {
      if (!b) continue;
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) st.entries.push({ kind: 'claude', text: b.text, at });
      else if (b.type === 'tool_use') {
        const e = { kind: 'tool', id: b.id, name: b.name, summary: toolSummary(b.name, b.input), detail: '', at };
        st.entries.push(e);
        if (b.id) st.tools.set(b.id, e);
      }
    }
  }
}

// Adds a chunk; an unfinished last line waits in state.rest for the next chunk.
export function appendTranscript(st, moreText) {
  const parts = (st.rest + String(moreText || '')).split('\n');
  st.rest = parts.pop();
  for (const l of parts) addLine(st, l);
  return st;
}

export function parseTranscript(text) {
  const st = appendTranscript(newTranscriptState(), text);
  addLine(st, st.rest);
  st.rest = '';
  return { entries: st.entries, badLines: st.badLines };
}
