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

module.exports = { buildResumeCommand, buildNewSessionCommand, buildPtyCommand, ID_RE };
