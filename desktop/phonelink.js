'use strict';
// Phone link (issue #37): a small HTTP server for paired phones. It serves site/, takes calls as JSON POST /api/<name>,
// and streams events (pty data, pty exit, notifications) as Server-Sent Events on GET /events. No Electron here, so tests can run it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PORT = 47213;
const CODE_TTL_MS = 5 * 60 * 1000;
const WRONG_MAX = 5; // wrong codes per minute before pairing is refused for a minute
const WINDOW_MS = 60 * 1000;
const COOKIE = 'router_key';
// Methods that open native windows, dialogs or folders on the PC. The phone may not call them.
const REFUSED = new Set(['resume', 'newSession', 'createAccount', 'openVisualFile', 'showVisualInFolder', 'newWindow', 'moveTile',
  'windowList', 'gridReady', 'handoffTiles', 'handoffRelay', 'notify']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(a, b); // both are 32-byte digests

// 100.64.0.0/10 is Tailscale's range.
const isTailscale = (a) => { const p = a.split('.').map(Number); return p[0] === 100 && p[1] >= 64 && p[1] <= 127; };

// [{ label, address }] from os.networkInterfaces(): the Tailscale address and the local network addresses, each named in words.
function addresses(ifaces) {
  const out = [];
  for (const list of Object.values(ifaces || {})) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      out.push({ label: isTailscale(i.address) ? 'Tailscale (works away from home, encrypted)' : 'Home Wi-Fi (same network only)', address: i.address });
    }
  }
  out.sort((a, b) => (a.label[0] === 'H' ? -1 : 1) - (b.label[0] === 'H' ? -1 : 1));
  return out.length ? out : [{ label: 'This computer only (no network found)', address: '127.0.0.1' }];
}

function deviceName(ua) {
  const m = /\(([^)]*)\)/.exec(String(ua || ''));
  return (m ? m[1] : String(ua || '')).slice(0, 60) || 'Unknown phone';
}

const PAIR_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Pair this phone</title><body style="font-family:sans-serif;padding:16px"><h1>Pair this phone</h1><p id="m">Pairing...</p>'
  + '<script>(async()=>{const m=document.getElementById("m");try{const r=await fetch("/pair",{method:"POST",headers:{"Content-Type":"application/json"},'
  + 'body:JSON.stringify({code:location.hash.slice(1)})});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||("Error "+r.status));}'
  + 'location.replace("/")}catch(e){m.textContent="Could not pair: "+e.message+". Scan a fresh code on the PC."}})()</script>';

// o = { dir (settings and keys folder), site (site/ folder), methods { name: fn(...args) }, now() }
function createPhoneLink(o) {
  const now = o.now || Date.now;
  const devFile = path.join(o.dir, 'phone-devices.json');
  const streams = new Map(); // device id -> Set of open SSE responses
  let server = null;
  let code = null; // { hash, expires }
  let wrong = []; // times of wrong codes in the last minute
  let lockedUntil = 0;
  let beat = null;

  const readDevices = () => {
    try { return JSON.parse(fs.readFileSync(devFile, 'utf8')); } catch (e) {
      if (e && e.code === 'ENOENT') return [];
      throw e; // an unreadable key file is not "no phones paired"; callers refuse the request and log it
    }
  };
  const writeDevices = (list) => { fs.mkdirSync(o.dir, { recursive: true }); fs.writeFileSync(devFile, JSON.stringify(list, null, 2), { mode: 0o600 }); };

  const keyOf = (req) => {
    const h = String(req.headers.authorization || '');
    if (/^Bearer /i.test(h)) return h.slice(7).trim();
    const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(String(req.headers.cookie || ''));
    return m ? m[1] : '';
  };
  // The device this request's key belongs to, or null.
  const deviceOf = (req) => {
    const k = keyOf(req);
    if (!k) return null;
    const h = sha(k);
    let list;
    try { list = readDevices(); } catch (e) { console.error('phone link: could not read the paired phones:', e); return null; }
    let hit = null;
    for (const d of list) if (same(h, Buffer.from(d.hash, 'hex'))) hit = d; // no early exit: same work for every key
    return hit;
  };

  const send = (res, status, body, type, extra) => {
    res.writeHead(status, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 4 * 1024 * 1024) { reject(new Error('Too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || 'null')); } catch (e) { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });

  function pair(req, res, body) {
    const t = now();
    wrong = wrong.filter((x) => t - x < WINDOW_MS);
    if (t < lockedUntil) return send(res, 429, { error: 'Too many wrong codes. Wait a minute.' });
    const given = body && typeof body.code === 'string' ? body.code : '';
    const ok = code && t < code.expires && same(sha(given), code.hash);
    if (!ok) {
      wrong.push(t);
      if (wrong.length >= WRONG_MAX) { lockedUntil = t + WINDOW_MS; wrong = []; }
      return send(res, 401, { error: 'That code is not valid or has run out.' });
    }
    code = null; // one use
    const key = crypto.randomBytes(32).toString('base64url');
    const list = readDevices();
    list.push({ id: crypto.randomBytes(6).toString('hex'), hash: sha(key).toString('hex'), name: deviceName(req.headers['user-agent']), pairedAt: new Date(t).toISOString() });
    writeDevices(list);
    send(res, 200, { ok: true, key }, null, { 'Set-Cookie': COOKIE + '=' + key + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=315360000' });
  }

  function events(req, res, dev) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': open\n\n');
    if (!streams.has(dev.id)) streams.set(dev.id, new Set());
    streams.get(dev.id).add(res);
    req.on('close', () => { const s = streams.get(dev.id); if (s) { s.delete(res); if (!s.size) streams.delete(dev.id); } });
  }

  async function api(req, res, name) {
    if (!Object.prototype.hasOwnProperty.call(o.methods, name) || REFUSED.has(name)) {
      return send(res, REFUSED.has(name) ? 403 : 404, { error: 'The phone may not call ' + name + '.' });
    }
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only.' });
    let args;
    try { args = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    if (!Array.isArray(args)) return send(res, 400, { error: 'The body must be a JSON array of arguments.' });
    try {
      const r = await o.methods[name](...args);
      send(res, 200, { result: r === undefined ? null : r });
    } catch (e) { send(res, 500, { error: String((e && e.message) || e) }); }
  }

  function file(res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
    if (rel === '/') rel = '/index.html';
    const full = path.resolve(o.site, '.' + rel);
    if (full !== o.site && !full.startsWith(o.site + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    let data;
    try { data = fs.readFileSync(full); } catch (e) { return send(res, 404, 'Not found', 'text/plain'); }
    if (rel === '/index.html') { // the stand-in must run before the app's module
      data = data.toString('utf8').replace('<script type="module"', '<script src="js/sources/remote.js"></script>\n<script type="module"');
    }
    send(res, 200, data, MIME[path.extname(full)] || 'application/octet-stream');
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/pair') {
      if (req.method === 'GET') return send(res, 200, PAIR_PAGE, 'text/html; charset=utf-8');
      if (req.method === 'POST') {
        let body = null;
        try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
        return pair(req, res, body);
      }
    }
    const dev = deviceOf(req);
    if (!dev) return send(res, 401, { error: 'Not paired.' });
    if (req.method === 'GET' && url.pathname === '/events') return events(req, res, dev);
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) return api(req, res, url.pathname.slice(5));
    if (req.method === 'GET') return file(res, url);
    send(res, 405, { error: 'Not allowed.' });
  }

  const link = {
    // Resolves the port in use (0 asks for any free one).
    start(port) {
      if (server) return Promise.resolve(link.port());
      return new Promise((resolve, reject) => {
        const s = http.createServer((req, res) => { handle(req, res).catch((e) => { console.error('phone link:', e); if (!res.headersSent) send(res, 500, { error: 'Server error.' }); else res.end(); }); });
        s.once('error', reject);
        s.listen(port, '0.0.0.0', () => {
          s.removeListener('error', reject);
          s.on('error', (e) => console.error('phone link server:', e));
          server = s;
          beat = setInterval(() => link.emit(null, ': beat'), 20000);
          beat.unref();
          resolve(link.port());
        });
      });
    },
    stop() {
      if (!server) return Promise.resolve();
      clearInterval(beat);
      const s = server; server = null; code = null;
      for (const set of streams.values()) for (const r of set) r.end();
      streams.clear();
      return new Promise((resolve) => { s.close(() => resolve()); s.closeAllConnections(); });
    },
    port: () => (server ? server.address().port : null),
    isOn: () => !!server,
    // A fresh one-time code (replaces any earlier one), good for five minutes.
    newCode() {
      const c = crypto.randomBytes(18).toString('base64url');
      code = { hash: sha(c), expires: now() + CODE_TTL_MS };
      return { code: c, expires: code.expires };
    },
    devices: () => readDevices().map((d) => ({ id: d.id, name: d.name, pairedAt: d.pairedAt })),
    // Removes the phone and cuts its open event streams.
    unpair(id) {
      const list = readDevices();
      const keep = list.filter((d) => d.id !== id);
      if (keep.length === list.length) return false;
      writeDevices(keep);
      for (const r of streams.get(id) || []) r.end();
      streams.delete(id);
      return true;
    },
    // Sends an event to every open phone stream. name null writes the raw text (a comment line).
    emit(name, payload) {
      if (!streams.size) return;
      const msg = name ? 'event: ' + name + '\ndata: ' + JSON.stringify(payload) + '\n\n' : payload + '\n\n';
      for (const set of streams.values()) for (const r of set) r.write(msg);
    },
  };
  return link;
}

module.exports = { createPhoneLink, addresses, deviceName, isTailscale, REFUSED, DEFAULT_PORT, CODE_TTL_MS };
