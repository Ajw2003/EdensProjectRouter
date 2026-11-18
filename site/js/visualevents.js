// Pure: transcript text (JSON lines) -> typed events for the Visual view, in order.
import { toolSummary } from './transcript.js';

const DETAIL_MAX = 4096;
const WHY_MAX = 300;
const VISUAL_EXT = /\.(html?|svg|png|jpe?g|gif|md)$/i;
const countLines = (s) => (typeof s === 'string' && s ? s.split('\n').length : 0);

export function newVisualState() {
  return { badLines: 0, rest: '', tools: new Map(), why: '', tasks: [], taskSeq: 0 };
}

function changed(name, i) {
  if (name === 'Write') return { added: countLines(i.content), removed: 0 };
  if (name === 'Edit') return { added: countLines(i.new_string), removed: countLines(i.old_string) };
  let added = 0; let removed = 0;
  if (Array.isArray(i.edits)) for (const e of i.edits) if (e) { added += countLines(e.new_string); removed += countLines(e.old_string); }
  return { added, removed };
}

function taskEvent(st, name, i) {
  if (name === 'TodoWrite') {
    st.tasks = (Array.isArray(i.todos) ? i.todos : []).filter((t) => t && typeof t === 'object')
      .map((t) => ({ text: String(t.content || t.subject || ''), status: String(t.status || 'pending') }));
  } else if (name === 'TaskCreate') {
    st.tasks.push({ key: String(++st.taskSeq), text: String(i.subject || i.content || ''), status: String(i.status || 'pending') });
  } else {
    const k = String(i.taskId == null ? '' : i.taskId);
    const t = st.tasks.find((x) => (k && x.key === k) || (i.subject && x.text === i.subject));
    if (t) { if (i.status) t.status = String(i.status); if (i.subject) t.text = String(i.subject); }
  }
  return { kind: 'tasks', items: st.tasks.map((t) => ({ text: t.text, status: t.status })) };
}

function question(id, i) {
  const qs = Array.isArray(i.questions) ? i.questions : [];
  return {
    kind: 'question', id,
    questions: qs.filter((q) => q && typeof q === 'object').map((q) => ({
      question: String(q.question || ''), header: String(q.header || ''), multiSelect: q.multiSelect === true,
      options: (Array.isArray(q.options) ? q.options : []).filter((o) => o && typeof o === 'object')
        .map((o) => ({ label: String(o.label || ''), description: String(o.description || '') })),
    })),
  };
}

function toolUse(st, b, out) {
  const i = b.input && typeof b.input === 'object' ? b.input : {};
  const id = b.id;
  st.tools.set(id, b.name);
  if (b.name === 'AskUserQuestion') out.push(question(id, i));
  else if (b.name === 'TodoWrite' || b.name === 'TaskCreate' || b.name === 'TaskUpdate') out.push(taskEvent(st, b.name, i));
  else {
    const path = i.file_path || i.notebook_path;
    const a = { kind: 'action', id, name: b.name, summary: toolSummary(b.name, b.input), added: 0, removed: 0, why: st.why };
    if (typeof path === 'string' && path) a.path = path;
    if (b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit') Object.assign(a, changed(b.name, i));
    out.push(a);
    if ((b.name === 'Edit' || b.name === 'Write') && a.path && VISUAL_EXT.test(a.path)) out.push({ kind: 'visual', path: a.path, type: a.path.match(VISUAL_EXT)[1].toLowerCase() });
  }
  out.push({ kind: 'pending', id });
}

function addLine(st, line, out) {
  line = line.trim();
  if (!line) return;
  let o;
  try { o = JSON.parse(line); } catch (e) { st.badLines++; return; }
  if (!o || typeof o !== 'object') { st.badLines++; return; }
  const c = o.message && o.message.content;
  if (o.type === 'user') {
    if (o.isMeta === true) return;
    if (typeof c === 'string') { if (c.trim()) { st.why = ''; out.push({ kind: 'you', text: c.trim() }); } return; }
    if (!Array.isArray(c)) return;
    for (const b of c) {
      if (!b) continue;
      if (b.type === 'tool_result' && b.tool_use_id) {
        const text = typeof b.content === 'string' ? b.content
          : (Array.isArray(b.content) ? b.content.filter((p) => p && typeof p.text === 'string').map((p) => p.text).join('\n') : '');
        out.push({ kind: 'result', id: b.tool_use_id, text: text.slice(0, DETAIL_MAX) });
        if (st.tools.get(b.tool_use_id) === 'AskUserQuestion') out.push({ kind: 'answered', id: b.tool_use_id });
      } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) { st.why = ''; out.push({ kind: 'you', text: b.text.trim() }); }
    }
  } else if (o.type === 'assistant' && Array.isArray(c)) {
    for (const b of c) {
      if (!b) continue;
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) { st.why = b.text.trim().slice(0, WHY_MAX); out.push({ kind: 'claude', text: b.text }); }
      else if (b.type === 'tool_use' && b.id) toolUse(st, b, out);
    }
  }
}

// Adds a chunk and returns the new events; an unfinished last line waits in state.rest.
export function appendVisual(st, chunk) {
  const out = [];
  const parts = (st.rest + String(chunk || '')).split('\n');
  st.rest = parts.pop();
  for (const l of parts) addLine(st, l, out);
  return out;
}

export function parseVisual(text) {
  const st = newVisualState();
  const events = appendVisual(st, text);
  addLine(st, st.rest, events);
  return { events, badLines: st.badLines };
}
