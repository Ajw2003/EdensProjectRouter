'use strict';
// Send to (issue #21), desktop side: hand-off files in <project>/.router-handoff/, the summary run, the local git exclude line,
// and the small settings file that remembers which session is a sub-session of which.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildSummaryCommand } = require('./launch');
const { readLayout, writeLayout } = require('./layoutstore');

const DIR = '.router-handoff';
const EXCLUDE_LINE = DIR + '/';
const SUMMARY_TIMEOUT_MS = 5 * 60 * 1000;

function checkCwd(cwd) {
  let ok = false;
  try { ok = typeof cwd === 'string' && !!cwd && fs.statSync(cwd).isDirectory(); } catch (e) { ok = false; }
  if (!ok) throw new Error('The project folder ' + cwd + ' does not exist, so nothing was written.');
}

// A plain file name: no folders, no dots-only names, no control characters.
function checkName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/\0:*?"<>|]/.test(name) || name.length > 200) {
    throw new Error('That file name is not allowed inside ' + DIR + ': ' + name);
  }
  return name;
}

// Where a name goes, proven to be directly inside <cwd>/.router-handoff.
function targetPath(cwd, name) {
  checkCwd(cwd);
  checkName(name);
  const dir = path.resolve(cwd, DIR);
  const full = path.resolve(dir, name);
  if (path.dirname(full) !== dir) throw new Error('That path would leave ' + DIR + ', so it was refused.');
  return { dir, full };
}

// -> { name, path } ; refuses to replace a file that is already there.
function write(cwd, name, text) {
  const { dir, full } = targetPath(cwd, name);
  if (typeof text !== 'string') throw new Error('No text was given to write.');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(full, text, { encoding: 'utf8', flag: 'wx' });
  } catch (e) {
    if (e && e.code === 'EEXIST') throw new Error(name + ' is already in ' + DIR + '. Nothing was overwritten.');
    throw e;
  }
  return { name, path: full };
}

function uniqueIn(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let n = name;
  for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = stem + '-' + i + ext;
  return n;
}

// Copies srcPath (a file) into the folder under its own name (-2, -3 if taken). -> { name, path }
function copyFile(cwd, srcPath) {
  checkCwd(cwd);
  let st;
  try { st = fs.statSync(srcPath); } catch (e) { throw new Error('The file ' + srcPath + ' could not be read: ' + e.message); }
  if (!st.isFile()) throw new Error(srcPath + ' is not a file, so it was not copied.');
  const dir = path.resolve(cwd, DIR);
  fs.mkdirSync(dir, { recursive: true });
  const name = uniqueIn(dir, checkName(path.basename(srcPath)));
  const full = path.join(dir, name);
  fs.copyFileSync(srcPath, full, fs.constants.COPYFILE_EXCL);
  return { name, path: full };
}

// Names already in the folder (empty when it does not exist yet).
function list(cwd) {
  checkCwd(cwd);
  try { return fs.readdirSync(path.join(cwd, DIR)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

// ---------- summary ----------
// o: { sessionId, cwd, accountDir, homeDir, env, platform, claudePath, spawnFn, timeoutMs } -> Promise<string>
function summary(o) {
  return new Promise((resolve, reject) => {
    let plan;
    try {
      if (!o.claudePath) throw new Error("Claude Code wasn't found. Install it, then try again.");
      plan = buildSummaryCommand(o);
    } catch (e) { return reject(e); }
    const spawnFn = o.spawnFn || spawn;
    let out = '';
    let err = '';
    let done = false;
    let child;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    try {
      child = spawnFn(plan.file, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) { return reject(e); }
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { console.error('could not stop the summary run:', e); }
      finish(reject, new Error('The summary took longer than ' + Math.round((o.timeoutMs || SUMMARY_TIMEOUT_MS) / 60000) + ' minutes and was stopped.'));
    }, o.timeoutMs || SUMMARY_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.once('error', (e) => finish(reject, new Error('Claude Code could not be run for the summary: ' + e.message)));
    child.once('close', (code) => {
      if (code !== 0) return finish(reject, new Error('Claude Code stopped with code ' + code + ' while writing the summary. ' + err.trim().slice(0, 500)));
      if (!out.trim()) return finish(reject, new Error('Claude Code returned no summary. ' + err.trim().slice(0, 500)));
      finish(resolve, out.trim() + '\n');
    });
  });
}

// ---------- git exclude ----------
// The folder git reads info/exclude from for the repository that contains cwd. Throws "not a git repository".
function gitInfoDir(cwd) {
  checkCwd(cwd);
  let dir = path.resolve(cwd);
  for (;;) {
    const dot = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(dot); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (st && st.isDirectory()) return path.join(dot, 'info');
    if (st && st.isFile()) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dot, 'utf8'));
      if (!m) throw new Error('The .git file in ' + dir + ' does not say where the repository is.');
      let gitdir = path.resolve(dir, m[1]);
      // A worktree keeps its own gitdir but git reads info/exclude from the main one (named in "commondir").
      try {
        const common = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim();
        if (common) gitdir = path.resolve(gitdir, common);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      return path.join(gitdir, 'info');
    }
    const up = path.dirname(dir);
    if (up === dir) throw new Error('Not a git repository: ' + cwd);
    dir = up;
  }
}

const lineIs = (l) => l.replace(/\r$/, '') === EXCLUDE_LINE;

function readExclude(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}

function gitExcludeGet(cwd) {
  return readExclude(path.join(gitInfoDir(cwd), 'exclude')).split('\n').some(lineIs);
}

// Adds or removes exactly the line ".router-handoff/"; every other line stays as it was. -> the state after.
function gitExcludeSet(cwd, on) {
  const info = gitInfoDir(cwd);
  const file = path.join(info, 'exclude');
  const text = readExclude(file);
  const lines = text.split('\n');
  const has = lines.some(lineIs);
  if (on && !has) {
    fs.mkdirSync(info, { recursive: true });
    fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + EXCLUDE_LINE + '\n', 'utf8');
  } else if (!on && has) {
    fs.writeFileSync(file, lines.filter((l) => !lineIs(l)).join('\n'), 'utf8');
  }
  return !!on;
}

// ---------- sub-session links ----------
// File shape: { version: 1, links: [{ child, parent }] }
function readLinks(file) {
  const v = readLayout(file);
  const links = v && Array.isArray(v.links) ? v.links : [];
  return links.filter((l) => l && typeof l.child === 'string' && typeof l.parent === 'string');
}

function addLink(file, child, parent) {
  if (typeof child !== 'string' || typeof parent !== 'string' || !child || !parent || child === parent) throw new Error('A child and a different parent are needed.');
  const links = readLinks(file).filter((l) => l.child !== child);
  links.push({ child, parent });
  writeLayout(file, { version: 1, links });
  return links;
}

module.exports = { DIR, EXCLUDE_LINE, write, copyFile, list, summary, gitExcludeGet, gitExcludeSet, readLinks, addLink };
