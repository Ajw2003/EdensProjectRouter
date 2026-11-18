// Pure: Visual view events (visualevents.js) -> cards, and taps -> terminal keys. No DOM.
// The key helpers repeat desktop/keys.js (CommonJS, not importable here); tests/visualcards.test.js checks they agree.

import { artifactLinks } from './visualsfind.js';

const cleanText = (t) => String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+$/, '');
export const keysForMessage = (text) => cleanText(text) + '\r';
export const keysForOption = (index, from = 0) => {
  const n = (index | 0) - (from | 0);
  return (n >= 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(n)) + '\r';
};
export const keysEsc = () => '\x1b';

export const isSuggested = (o) => /\(recommended\)|suggest/i.test((o.label || '') + ' ' + (o.description || ''));

// 'User has answered your questions: "Q"="Red". You can now...' -> 'Red'; anything else is shown as it is.
export function answerText(result) {
  const t = String(result || '');
  const quoted = [...t.matchAll(/"[^"]*"="([^"]*)"/g)].map((m) => m[1]);
  return quoted.join(', ') || t.trim();
}

// events -> cards, in order. Results fold into their action; an 'answered' event closes its question.
export function buildCards(events) {
  const cards = [];
  const byId = new Map();
  for (const e of events || []) {
    if (e.kind === 'you' || e.kind === 'claude') {
      cards.push({ kind: e.kind, text: e.text });
      if (e.kind === 'claude') for (const url of artifactLinks(e.text)) cards.push({ kind: 'artifact', url });
    } else if (e.kind === 'visual') cards.push({ kind: 'visual', path: e.path, type: e.type });
    else if (e.kind === 'action') { const c = { kind: 'action', id: e.id, name: e.name, summary: e.summary, path: e.path || '', added: e.added, removed: e.removed, why: e.why || '', result: null }; cards.push(c); byId.set(e.id, c); }
    else if (e.kind === 'question') { const c = { kind: 'question', id: e.id, questions: e.questions, answered: false, answer: '', result: '' }; cards.push(c); byId.set(e.id, c); }
    else if (e.kind === 'result') { const c = byId.get(e.id); if (c) c.result = e.text; }
    else if (e.kind === 'answered') { const c = byId.get(e.id); if (c) { c.answered = true; c.answer = answerText(c.result); } }
    else if (e.kind === 'tasks') { const i = cards.findIndex((c) => c.kind === 'tasks'); const c = { kind: 'tasks', items: e.items }; if (i >= 0) cards[i] = c; else cards.push(c); }
  }
  for (const c of cards) if (c.kind === 'action') c.done = c.result !== null;
  return cards;
}

// A question card taps only when it is one single-choice question; otherwise it is answered in the Terminal view.
export const tappable = (card) => card.questions.length === 1 && !card.questions[0].multiSelect && card.questions[0].options.length > 0;

const idx = (labels, re) => (Array.isArray(labels) ? labels : []).findIndex((l) => re.test(l));

// screen = screenWaiting() result { kind, options, selected }. -> keys, or null when the screen shows no such option.
export function permissionKeys(which, screen) {
  if (!screen || screen.kind !== 'permission') return null;
  const re = which === 'allow' ? /^yes\b(?!,)/i : which === 'always' ? /^yes\b.*(don'?t ask again|always|allow all)/i : /^no\b/i;
  let i = idx(screen.options, re);
  if (i < 0 && which === 'allow') i = idx(screen.options, /^yes\b/i);
  return i < 0 ? null : keysForOption(i, screen.selected);
}
export function optionKeys(index, screen) {
  return screen && screen.kind ? keysForOption(index, screen.selected) : null;
}
// "My own answer": pick the screen's "Type something." option, then type the text.
export function ownAnswerKeys(text, screen) {
  if (!screen || !screen.kind) return null;
  const i = idx(screen.options, /^type something|^other\b/i);
  return i < 0 || !cleanText(text) ? null : keysForOption(i, screen.selected) + keysForMessage(text);
}

// The lines above the selector (the question being asked), last three, for the permission card.
export function permissionText(lines) {
  const l = (lines || []).map(String);
  let first = l.findIndex((x) => /^[\s│|]*[❯>]?\s*1\.\s+\S/.test(x));
  if (first < 0) first = l.length;
  return l.slice(0, first).map((x) => x.replace(/[│|╭╮╰╯─]/g, '').trim()).filter(Boolean).slice(-3).join('\n');
}

// A picked file's path as typed into a message; Claude Code accepts a pasted path, quoted when it has spaces.
export const pathToType = (p) => (/\s/.test(p) ? '"' + p + '"' : p);
