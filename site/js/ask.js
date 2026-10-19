// Pure helpers for Ask another session (issue #22): question check, answer file name, the read-only run's arguments, the rule for
// the "Ask a read-only copy" button, and the session picker's list. No DOM, no file access.
import { handoffFileName } from './handoff.js';
import { usageText } from './accounts.js';

export const MAX_QUESTION = 4000;

// Trimmed question, or throws a message to show under the box. Keep equal to cleanQuestion in desktop/launch.js.
export function validateQuestion(q) {
  if (typeof q !== 'string' || !q.trim()) throw new Error('Type a question first.');
  const t = q.trim();
  if (t.length > MAX_QUESTION) throw new Error('The question is longer than ' + MAX_QUESTION + ' characters.');
  return t;
}

// <yyyy-mm-dd>-answer-<slug of the question>.md, -2, -3 ... when taken.
export function answerFileName(ms, question, existing) {
  return handoffFileName(ms, 'answer ' + question, existing);
}

// The arguments of the read-only run; desktop/launch.js builds the same list (a test keeps them equal). The question is not among
// them: it goes in on stdin, so no shell or cmd.exe ever reads it.
export function askArgs(sessionId) {
  return ['-p', '--resume', sessionId, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob'];
}

// Is the read-only button usable? lim = the other session's account's reading or undefined.
// -> { enabled, reason (shown under the button, '' when enabled), unknown (offer the checkbox) }
export function readOnlyState(lim, allowNoReading, accountName) {
  const who = accountName || 'that account';
  if (!lim || lim.fiveHourPct == null) {
    if (allowNoReading) return { enabled: true, reason: '', unknown: true };
    return { enabled: false, reason: 'No limit reading for ' + who + ' yet. Tick “Ask without a limit reading” to ask anyway.', unknown: true };
  }
  if (lim.fiveHourPct >= 100) return { enabled: false, reason: 'The 5-hour limit on ' + who + ' is used up (100%). Try again after it resets.', unknown: false };
  return { enabled: true, reason: '', unknown: false };
}

// Same wording as the Summary option in Send to: "uses usage on <account>: 5-hour 40%, weekly 12%".
export function readOnlyLabel(accountName, lim) {
  return 'Ask a read-only copy (uses usage on ' + accountName + ': ' + usageText(lim).replace(' · ', ', ') + ')';
}

// Sessions to pick from: every account, newest first, not the asking one, filtered by words in the title, project or id.
export function pickerList(sessions, asking, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (sessions || [])
    .filter((s) => !(asking && s.accountId === asking.accountId && s.id === asking.id))
    .filter((s) => { const hay = (s.title + ' ' + s.project + ' ' + s.id).toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => (b.lastActiveMs || 0) - (a.lastActiveMs || 0));
}
