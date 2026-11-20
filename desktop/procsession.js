'use strict';
const fs = require('fs');
const path = require('path');

const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

// Read-only: the { sessionId, status } Claude Code keeps in <accountDir>/sessions/<pid>.json for its running process, or null when
// the file is missing or not what we expect. Every other key in the file is ignored on purpose.
function readProcessSession(accountDir, pid) {
  if (!accountDir || !Number.isInteger(pid) || pid <= 0) return null;
  let raw;
  try { raw = fs.readFileSync(path.join(accountDir, 'sessions', pid + '.json'), 'utf8'); } catch (e) { return null; } // missing is the normal case early on
  let o;
  try { o = JSON.parse(raw); } catch (e) { return null; } // half-written or not JSON: ask again later
  if (!o || typeof o !== 'object' || typeof o.sessionId !== 'string' || !ID_RE.test(o.sessionId)) return null;
  return { sessionId: o.sessionId, status: typeof o.status === 'string' ? o.status.slice(0, 40) : '' };
}

module.exports = { readProcessSession };
