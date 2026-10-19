'use strict';
// The router-file:// guard: decides which file a request may read. Only files inside a known project folder are served.
const path = require('path');
const fs = require('fs');

const HOST = 'local';

// router-file://local/<encodeURIComponent(absolute path)>
function fileUrl(absPath) {
  return 'router-file://' + HOST + '/' + encodeURIComponent(absPath);
}

// Decodes the request URL to a path, or null when it is not a well-formed router-file URL.
function pathFromUrl(requestUrl) {
  let u;
  try { u = new URL(requestUrl); } catch (e) { return null; }
  if (u.protocol !== 'router-file:' || u.hostname !== HOST) return null;
  const rest = u.pathname.replace(/^\//, '');
  let p;
  try { p = decodeURIComponent(rest); } catch (e) { return null; }
  return p || null;
}

function inside(file, root, ci, sep) {
  const f = ci ? file.toLowerCase() : file;
  const r = ci ? root.toLowerCase() : root;
  return f === r || f.startsWith(r.endsWith(sep) ? r : r + sep);
}

// roots: known project folders. opts: { platform, realpath(p) }.
// Returns { ok: true, file } or { ok: false, status, reason }: 400 malformed URL, 403 outside the roots, 404 no such file.
function checkRequest(requestUrl, roots, opts) {
  const o = opts || {};
  const plat = o.platform || process.platform;
  const pp = plat === 'win32' ? path.win32 : path.posix;
  const ci = plat === 'win32';
  const raw = pathFromUrl(requestUrl);
  if (!raw) return { ok: false, status: 400, reason: 'Bad request' };
  if (!pp.isAbsolute(raw) || raw.includes('\0')) return { ok: false, status: 403, reason: 'Forbidden' };
  const file = pp.resolve(raw);
  const real = o.realpath || ((p) => fs.realpathSync(p));
  const rootList = (roots || []).filter((r) => typeof r === 'string' && pp.isAbsolute(r)).map((r) => pp.resolve(r));
  if (!rootList.some((r) => inside(file, r, ci, pp.sep))) return { ok: false, status: 403, reason: 'Forbidden' };
  let resolved;
  try { resolved = real(file); } catch (e) { return { ok: false, status: 404, reason: 'Not found' }; }
  // A link inside the folder that points outside it is refused too.
  const realRoots = rootList.map((r) => { try { return real(r); } catch (e) { return r; } });
  if (!realRoots.some((r) => inside(resolved, r, ci, pp.sep))) return { ok: false, status: 403, reason: 'Forbidden' };
  return { ok: true, file: resolved };
}

module.exports = { fileUrl, pathFromUrl, checkRequest, HOST };
