'use strict';
const fs = require('fs');
const path = require('path');
const { ID_RE } = require('./launch');

function safeName(n) {
  if (typeof n !== 'string' || !n || n === '.' || n === '..' || /[\\/]/.test(n)) throw new Error('Bad name: ' + n);
  return n;
}

// Copies one file unless the target already has one at least as new. Returns 'copied' or 'skipped'.
function copyFileKeepNewer(src, dst) {
  const s = fs.statSync(src);
  let d = null;
  try { d = fs.statSync(dst); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (d && d.mtimeMs >= s.mtimeMs) return 'skipped';
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  fs.utimesSync(dst, s.atime, s.mtime);
  return 'copied';
}

function copyTree(srcDir, dstDir, out) {
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name);
    const d = path.join(dstDir, e.name);
    if (e.isDirectory()) copyTree(s, d, out);
    else if (e.isFile()) out[copyFileKeepNewer(s, d)].push(d);
  }
}

// Copies a session's transcript (and its sibling folder of the same id, if there is one) from one account folder to another,
// under projects/<project>/. Never overwrites a file that is newer or equal there, never deletes anything.
// -> { copied: [paths], skipped: [paths] }
function copySession(fromDir, toDir, project, sessionId) {
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) throw new Error('That session id looks wrong, so nothing was copied.');
  safeName(project);
  if (path.resolve(fromDir) === path.resolve(toDir)) throw new Error('That is the same account, so nothing was copied.');
  const srcProj = path.join(fromDir, 'projects', project);
  const dstProj = path.join(toDir, 'projects', project);
  const transcript = path.join(srcProj, sessionId + '.jsonl');
  if (!fs.existsSync(transcript)) throw new Error('The conversation file was not found: ' + transcript);
  const out = { copied: [], skipped: [] };
  const dstFile = path.join(dstProj, sessionId + '.jsonl');
  out[copyFileKeepNewer(transcript, dstFile)].push(dstFile);
  const sib = path.join(srcProj, sessionId);
  let isDir = false;
  try { isDir = fs.statSync(sib).isDirectory(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (isDir) copyTree(sib, path.join(dstProj, sessionId), out);
  return out;
}

module.exports = { copySession };
