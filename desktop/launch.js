'use strict';
const fs = require('fs');
const path = require('path');

const ID_RE = /^[0-9a-f-]{8,64}$/i;

function checkCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd) throw new Error('No folder was given for this session.');
  let ok = false;
  try { ok = fs.statSync(cwd).isDirectory(); } catch (e) { ok = false; }
  if (!ok) throw new Error('The folder ' + cwd + ' no longer exists, so the session was not started.');
}

function buildEnv(baseEnv, accountDir, homeDir) {
  const env = { ...baseEnv };
  const isDefault = path.resolve(accountDir) === path.resolve(path.join(homeDir, '.claude'));
  if (isDefault) delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = accountDir;
  return env;
}

function wrap(command, cwd, env, opts) {
  const platform = opts.platform || process.platform;
  if (platform === 'win32') {
    if (opts.useWt === false) {
      return { file: 'cmd.exe', args: ['/c', 'start', '"Project Router"', 'cmd', '/k', command], cwd, env };
    }
    return { file: 'wt.exe', args: ['-d', cwd, 'cmd', '/k', command], cwd, env };
  }
  return { file: 'x-terminal-emulator', args: ['-e', 'sh', '-c', command + '; exec "${SHELL:-sh}"'], cwd, env };
}

// opts: { homeDir, accountDir, env (base env), platform, useWt }
function buildResumeCommand(sessionId, cwd, opts) {
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) throw new Error('That session id looks wrong, so nothing was started.');
  checkCwd(cwd);
  return wrap('claude --resume ' + sessionId, cwd, buildEnv(opts.env || process.env, opts.accountDir, opts.homeDir), opts);
}

function buildNewSessionCommand(cwd, opts) {
  checkCwd(cwd);
  return wrap('claude', cwd, buildEnv(opts.env || process.env, opts.accountDir, opts.homeDir), opts);
}

// Plan for a pty-hosted claude. sessionId null = new session.
// o: { sessionId, cwd, accountDir, homeDir, env, platform, claudePath }
function buildPtyCommand(o) {
  const platform = o.platform || process.platform;
  const tail = [];
  if (o.sessionId !== null && o.sessionId !== undefined) {
    if (typeof o.sessionId !== 'string' || !ID_RE.test(o.sessionId)) throw new Error('That session id looks wrong, so nothing was started.');
    tail.push('--resume', o.sessionId);
    if (o.fork) tail.push('--fork-session'); // a sub-session: continues a copy, the original is left alone
  } else if (o.fork) {
    throw new Error('A sub-session needs the id of the session it comes from.');
  }
  checkCwd(o.cwd);
  const env = buildEnv(o.env || process.env, o.accountDir, o.homeDir);
  env.TERM = 'xterm-256color';
  let file = o.claudePath || 'claude';
  let args = tail;
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    args = ['/d', '/s', '/c', file, ...tail];
    file = 'cmd.exe';
  }
  return { file, args, cwd: o.cwd, env };
}

// Plan for the summary run: `claude -p --resume <id> --fork-session ...` with no pty. Keep the arguments equal to summaryArgs in
// site/js/handoff.js (a test checks it). o: { sessionId, cwd, accountDir, homeDir, env, platform, claudePath }
const SUMMARY_PROMPT = 'Write a short handover summary of this conversation for a colleague who will carry on the work in another session. '
  + 'Cover the goals, the decisions made, the current state, the open problems and the key files. '
  + 'Keep it under 400 words, use Markdown headings, and do not change anything.';
// Shared by the summary and Ask runs: a read-only fork whose prompt goes in on stdin (plan.input), never on the command line.
// On the command line it would need quoting for cmd.exe (a .cmd launcher), which node cannot do safely for & | < > ^ % " and
// line breaks; and after --tools, which takes a list, it would be read as a tool name.
function readOnlyPlan(o, prompt, what) {
  const platform = o.platform || process.platform;
  if (typeof o.sessionId !== 'string' || !ID_RE.test(o.sessionId)) throw new Error('That session id looks wrong, so ' + what + ' was not started.');
  checkCwd(o.cwd);
  const tail = ['-p', '--resume', o.sessionId, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob'];
  let file = o.claudePath || 'claude';
  let args = tail;
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    args = ['/d', '/s', '/c', file, ...tail];
    file = 'cmd.exe';
  }
  return { file, args, input: prompt, cwd: o.cwd, env: buildEnv(o.env || process.env, o.accountDir, o.homeDir) };
}

function buildSummaryCommand(o) {
  return readOnlyPlan(o, SUMMARY_PROMPT, 'no summary');
}

// Ask another session (issue #22). The question is validated (trimmed, not empty) and goes in on stdin exactly as typed.
const MAX_QUESTION = 4000;
function cleanQuestion(q) {
  if (typeof q !== 'string') throw new Error('Type a question first.');
  const t = q.trim();
  if (!t) throw new Error('Type a question first.');
  if (t.length > MAX_QUESTION) throw new Error('The question is longer than ' + MAX_QUESTION + ' characters.');
  if (t.includes('\0')) throw new Error('The question has a character that cannot be sent.');
  return t;
}

// o: as buildSummaryCommand plus question. plan.question is the text actually sent.
function buildAskCommand(o) {
  const q = cleanQuestion(o.question);
  return { ...readOnlyPlan(o, q, 'the question'), question: q };
}

// Plan for `claude auth login` in a pty, signing in to the folder accountDir.
// o: { accountDir, homeDir, env, platform, claudePath }
function buildLoginCommand(o) {
  const platform = o.platform || process.platform;
  checkCwd(o.homeDir);
  const env = { ...(o.env || process.env), CLAUDE_CONFIG_DIR: o.accountDir, TERM: 'xterm-256color' };
  const tail = ['auth', 'login'];
  let file = o.claudePath || 'claude';
  let args = tail;
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    args = ['/d', '/s', '/c', file, ...tail];
    file = 'cmd.exe';
  }
  return { file, args, cwd: o.homeDir, env };
}

module.exports = { buildResumeCommand, buildNewSessionCommand, buildPtyCommand, buildLoginCommand, buildSummaryCommand, buildAskCommand, cleanQuestion, ID_RE };
