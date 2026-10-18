'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

const HEAD = 64 * 1024;
const TAIL = 256 * 1024;

// reporter.js is an ES module shared with the website; load it with dynamic import().
// Packaged, main.js points this at resources/site/js/reporter.js.
let reporterPath = path.join(__dirname, '..', 'site', 'js', 'reporter.js');
let reporterMod = null;
function setReporterPath(p) { reporterPath = p; reporterMod = null; }
function loadReporter() {
  if (!reporterMod) reporterMod = import(pathToFileURL(reporterPath).href);
  return reporterMod;
}

function safeName(n) {
  if (typeof n !== 'string' || !n || n === '.' || n === '..' || /[\\/]/.test(n)) throw new Error('Bad name: ' + n);
  return n;
}

async function listSessionFiles(dir) {
  const out = [];
  const root = path.join(dir, 'projects');
  for (const p of await fs.promises.readdir(root, { withFileTypes: true })) {
    if (!p.isDirectory()) continue;
    for (const f of await fs.promises.readdir(path.join(root, p.name), { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const st = await fs.promises.stat(path.join(root, p.name, f.name));
      out.push({ project: p.name, file: f.name, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return out;
}

async function readSessionText(dir, project, file) {
  const full = path.join(dir, 'projects', safeName(project), safeName(file));
  const fh = await fs.promises.open(full, 'r');
  try {
    const { size } = await fh.stat();
    if (size <= HEAD + TAIL) return { text: await fh.readFile('utf8'), wasCut: false };
    const hb = Buffer.alloc(HEAD);
    await fh.read(hb, 0, HEAD, 0);
    let head = hb.toString('utf8');
    const nl = head.lastIndexOf('\n');
    head = nl >= 0 ? head.slice(0, nl) : '';
    const tb = Buffer.alloc(TAIL);
    await fh.read(tb, 0, TAIL, size - TAIL);
    const tail = tb.toString('utf8');
    const joinLine = head ? head.split('\n').length : 0;
    return { text: head + '\n' + tail, wasCut: true, joinLine };
  } finally {
    await fh.close();
  }
}

const TRANSCRIPT_MAX = 5 * 1024 * 1024;
// Reads from fromByte to the end; from 0 on a big file, only the last 5 MB (cut to a whole line).
async function readTranscript(dir, project, file, fromByte) {
  const full = path.join(dir, 'projects', safeName(project), safeName(file));
  const fh = await fs.promises.open(full, 'r');
  try {
    const { size } = await fh.stat();
    let start = Number.isFinite(fromByte) && fromByte > 0 ? Math.floor(fromByte) : 0;
    if (start > size) start = size;
    let cut = false;
    if (start === 0 && size > TRANSCRIPT_MAX) { start = size - TRANSCRIPT_MAX; cut = true; }
    const buf = Buffer.alloc(size - start);
    let got = 0;
    while (got < buf.length) {
      const { bytesRead } = await fh.read(buf, got, buf.length - got, start + got);
      if (!bytesRead) break;
      got += bytesRead;
    }
    let text = buf.subarray(0, got).toString('utf8');
    if (cut) { const nl = text.indexOf('\n'); text = nl >= 0 ? text.slice(nl + 1) : ''; }
    return { text, size };
  } finally {
    await fh.close();
  }
}

async function readStatus(dir) {
  const sdir = path.join(dir, 'router', 'status');
  let names;
  try {
    names = await fs.promises.readdir(sdir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const t = await fs.promises.readFile(path.join(sdir, n), 'utf8');
    try { out.push(JSON.parse(t)); } catch (e) { out.push({ error: 'bad-status-file', file: n, message: String(e) }); }
  }
  return out;
}

async function readOrNull(p) {
  try { return await fs.promises.readFile(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function reporterState(dir) {
  const { isInstalled } = await loadReporter();
  const t = await readOrNull(path.join(dir, 'settings.json'));
  return t !== null && isInstalled(t) ? 'on' : 'off';
}

async function setReporter(dir, on) {
  const { planInstall, planRemove, isInstalled } = await loadReporter();
  const settingsPath = path.join(dir, 'settings.json');
  const routerDir = path.join(dir, 'router');
  const current = await readOrNull(settingsPath);
  const currentText = current === null ? '{}' : current;
  if (on) {
    let prevRaw;
    if (isInstalled(currentText)) {
      prevRaw = await readOrNull(path.join(routerDir, 'previous-statusline.json'));
    } else {
      let sl;
      try { sl = JSON.parse(currentText).statusLine; } catch (e) { throw new Error('settings.json is not valid JSON, so it was left alone: ' + e); }
      prevRaw = sl === undefined ? null : JSON.stringify(sl);
    }
    const plan = planInstall(currentText, prevRaw);
    await fs.promises.mkdir(routerDir, { recursive: true });
    await fs.promises.writeFile(settingsPath + '.router-backup', plan.backupText);
    if (plan.previousStatusLineJson != null) await fs.promises.writeFile(path.join(routerDir, 'previous-statusline.json'), plan.previousStatusLineJson);
    if (plan.previousCommandText != null) await fs.promises.writeFile(path.join(routerDir, 'previous-statusline.txt'), plan.previousCommandText);
    await fs.promises.writeFile(settingsPath, plan.settingsText);
  } else {
    const plan = planRemove(currentText, await readOrNull(path.join(routerDir, 'previous-statusline.json')));
    await fs.promises.writeFile(settingsPath + '.router-backup', currentText);
    await fs.promises.writeFile(settingsPath, plan.settingsText);
  }
}

let lastError = null;
function claudeRunning() {
  const win = process.platform === 'win32';
  const [cmd, args] = win ? ['tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/NH']] : ['pgrep', ['-f', 'claude']];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      // pgrep exits 1 when nothing matches: a real "no", not a failure.
      if (err && !win && err.code === 1) return resolve(false);
      if (err) {
        lastError = String(err);
        console.error('claudeRunning failed:', lastError);
        return resolve(false);
      }
      resolve(win ? /claude\.exe/i.test(stdout) : stdout.trim().length > 0);
    });
  });
}

module.exports = { listSessionFiles, readSessionText, readTranscript, readStatus, reporterState, setReporter, claudeRunning, setReporterPath, lastError: () => lastError };
