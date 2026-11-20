// Pure logic of the ADHD and autism layer: the What to show presets and switches, the Needs-you list, the Now strip
// and the Where-you-were card. No DOM. The two small storage helpers use localStorage like the stars do.
import { buildCards } from './visualcards.js';
import { parseVisual } from './visualevents.js';
import { cleanTitle } from './titles.js';

export const KINDS = [
  ['why', 'Why lines'], ['actions', 'Action cards'], ['results', 'Raw results'], ['tasks', 'Task strip'],
  ['pictures', 'Pictures'], ['artifacts', 'Artifact cards'], ['where', 'Where you were'], ['notify', 'Notifications'],
];
const only = (...on) => Object.fromEntries(KINDS.map(([k]) => [k, on.includes(k)]));
export const PRESETS = {
  calm: only('why', 'tasks', 'pictures', 'artifacts', 'where', 'notify'), // actions and raw results stay folded
  balanced: only('why', 'actions', 'tasks', 'pictures', 'artifacts', 'where', 'notify'),
  everything: only(...KINDS.map(([k]) => k)), // all on, results unfolded
};
export const PRESET_LABELS = { calm: 'Calm', balanced: 'Balanced', everything: 'Everything' };

export const defaultSettings = () => ({ switches: { ...PRESETS.calm }, reduceMotion: false });

// Anything saved that is not our shape falls back to Calm, one switch at a time.
export function parseSettings(raw) {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  const sw = raw.switches && typeof raw.switches === 'object' ? raw.switches : {};
  for (const [k] of KINDS) if (typeof sw[k] === 'boolean') s.switches[k] = sw[k];
  s.reduceMotion = raw.reduceMotion === true;
  return s;
}
export const setPreset = (s, name) => (PRESETS[name] ? { ...s, switches: { ...PRESETS[name] } } : s);
export const setSwitch = (s, kind, on) => (KINDS.some(([k]) => k === kind) ? { ...s, switches: { ...s.switches, [kind]: on === true } } : s);
// The preset the switches match, or 'custom' once one was flipped by hand.
export const presetOf = (s) => Object.keys(PRESETS).find((n) => KINDS.every(([k]) => PRESETS[n][k] === s.switches[k])) || 'custom';

const KEY = 'router.calm';
export function loadSettings() {
  try { return parseSettings(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return defaultSettings(); }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* works without storage */ }
}

// ----- Needs you -----
// "Bash command\nnpm test\nDo you want to proceed?" -> "npm test"
export function permissionCommand(text) {
  const l = String(text || '').split('\n').map((x) => x.trim()).filter((x) => x && !/proceed\?|^bash command$/i.test(x));
  return l.length ? l[l.length - 1] : 'a command';
}
export const waitingText = (kind, text) => (kind === 'permission' ? 'Wants to run ' + permissionCommand(text) : 'Asks: ' + (String(text || '').trim() || 'a question'));
// items = [{ key, project, accountId, kind: 'question'|'permission', text, atMs }] -> one row per key, newest first.
export function needsYouList(items) {
  const by = new Map();
  for (const i of items || []) if (i && i.key && !by.has(i.key)) by.set(i.key, { ...i, what: waitingText(i.kind, i.text) });
  return [...by.values()].sort((a, b) => b.atMs - a.atMs);
}
export const addedKeys = (before, list) => list.filter((i) => !before.has(i.key));
export const notificationText = (i) => i.project + ' needs you: ' + i.what;

// The last unanswered AskUserQuestion in these events, or null.
export function openQuestion(events) {
  const q = buildCards(events).filter((c) => c.kind === 'question').pop();
  return q && !q.answered ? q : null;
}
export const questionText = (q) => q.questions.map((x) => x.question).filter(Boolean).join(' ');
export const openQuestionOf = (text) => openQuestion(parseVisual(text).events);

// ----- Now strip -----
// The last task list -> steps: done (green), now (in progress), next.
export function taskSteps(events) {
  const t = buildCards(events).filter((c) => c.kind === 'tasks').pop();
  if (!t) return null;
  const steps = t.items.map((x) => ({ text: x.text, state: x.status === 'completed' ? 'done' : x.status === 'in_progress' ? 'now' : 'next' }));
  return { steps, done: steps.filter((s) => s.state === 'done').length };
}

// ----- Where you were -----
const short = (t, n = 140) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const IDLE_MS = 30 * 60 * 1000;
// goal = the first message you sent (cleaned) or the title; last = whichever came last, an action or Claude's words.
export function whereYouWere(events, title) {
  const evs = events || [];
  const first = evs.find((e) => e.kind === 'you' && cleanTitle(e.text, 140));
  const last = evs.filter((e) => e.kind === 'action' || e.kind === 'claude').pop();
  const goal = first ? short(cleanTitle(first.text, 400), 140) : short(title);
  const done = last ? short(last.kind === 'action' ? last.summary : last.text) : '';
  return goal || done ? { goal, last: done } : null;
}
export const showWhere = (lastActiveMs, nowMs) => nowMs - lastActiveMs > IDLE_MS;
