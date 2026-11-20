import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { createPhoneLink, addresses } = createRequire(import.meta.url)('../desktop/phonelink.js');
// fileURLToPath, not .pathname: on Windows .pathname is /D:/..., which resolves to a folder that does not exist.
const site = fileURLToPath(new URL('../site', import.meta.url));
// A failed assertion skips that test's own stop(), and one open server keeps the whole file running.
const started = [];
after(async () => { for (const l of started) { try { await l.stop(); } catch (e) { /* already stopped */ } } });

async function setup(clock) {
  const dir = mkdtempSync(join(tmpdir(), 'phonelink-'));
  const calls = [];
  const link = createPhoneLink({ dir, site, now: clock && (() => clock.t), methods: { echo: async (...a) => { calls.push(a); return a; }, resume: async () => 'no' } });
  started.push(link);
  const port = await link.start(0);
  const base = 'http://127.0.0.1:' + port;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const pairWith = (code) => post('/pair', { code }, { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome' });
  return { dir, link, base, post, pairWith, calls };
}

test('pairing swaps the code for a key that works as cookie and as bearer', async () => {
  const s = await setup();
  const r = await s.pairWith(s.link.newCode().code);
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const { key } = await r.json();
  assert.equal(Buffer.from(key, 'base64url').length, 32);
  const viaCookie = await s.post('/api/echo', [1, 'a'], { Cookie: cookie.split(';')[0] });
  assert.deepEqual(await viaCookie.json(), { result: [1, 'a'] });
  const viaBearer = await s.post('/api/echo', [2], { Authorization: 'Bearer ' + key });
  assert.equal(viaBearer.status, 200);
  const dev = s.link.devices();
  assert.equal(dev.length, 1);
  assert.equal(dev[0].name, 'Linux; Android 14; Pixel 8');
  assert.ok(!readFileSync(join(s.dir, 'phone-devices.json'), 'utf8').includes(key), 'the key itself is not stored');
  await s.link.stop();
});

test('an expired code and a reused code are refused', async () => {
  const clock = { t: 1_000_000 };
  const s = await setup(clock);
  const old = s.link.newCode().code;
  clock.t += 5 * 60 * 1000 + 1;
  assert.equal((await s.pairWith(old)).status, 401);
  const c = s.link.newCode().code;
  assert.equal((await s.pairWith(c)).status, 200);
  assert.equal((await s.pairWith(c)).status, 401);
  await s.link.stop();
});

test('a request without a paired key gets 401, except the pair page', async () => {
  const s = await setup();
  assert.equal((await fetch(s.base + '/')).status, 401);
  assert.equal((await fetch(s.base + '/events')).status, 401);
  assert.equal((await s.post('/api/echo', [])).status, 401);
  assert.equal((await s.post('/api/echo', [], { Authorization: 'Bearer nope' })).status, 401);
  assert.equal((await fetch(s.base + '/pair')).status, 200);
  await s.link.stop();
});

test('a page navigation without a key gets a not-paired page with the rescan button; fetches keep the JSON', async () => {
  const s = await setup();
  const r = await fetch(s.base + '/', { headers: { Accept: 'text/html,application/xhtml+xml' } });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('content-type'), /^text\/html; charset=utf-8/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const html = await r.text();
  assert.match(html, /not paired/);
  assert.ok(html.includes('/^https?:\\/\\/localhost$/.test(a)'), 'the app origin is validated');
  assert.ok(html.includes('/?rescan=1'));
  const j = await fetch(s.base + '/');
  assert.equal(j.status, 401);
  assert.deepEqual(await j.json(), { error: 'Not paired.' });
  const post = await s.post('/api/echo', [], { Accept: 'text/html' });
  assert.deepEqual(await post.json(), { error: 'Not paired.' });
  await s.link.stop();
});

test('the pair page validates the app origin before offering Scan a new code; a wrong code is still JSON 401', async () => {
  const s = await setup();
  const html = await (await fetch(s.base + '/pair')).text();
  assert.ok(html.includes('/^https?:\\/\\/localhost$/.test(a)'));
  assert.ok(html.includes('Scan a new code') && html.includes('/?rescan=1'));
  const r = await s.pairWith('wrong');
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: 'That code is not valid or has run out.' });
  await s.link.stop();
});

test('a paired phone gets the site with remote.js loaded before the main module', async () => {
  const s = await setup();
  const cookie = (await s.pairWith(s.link.newCode().code)).headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(s.base + '/', { headers: { Cookie: cookie } })).text();
  assert.ok(html.indexOf('js/sources/remote.js') > -1 && html.indexOf('js/sources/remote.js') < html.indexOf('js/main.js'));
  assert.equal((await fetch(s.base + '/js/sources/remote.js', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(s.base + '/..%2fdesktop%2fmain.js', { headers: { Cookie: cookie } })).status, 403);
  await s.link.stop();
});

test('unpairing makes the key fail and cuts the open stream', async () => {
  const s = await setup();
  const r = await s.pairWith(s.link.newCode().code);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const ev = await fetch(s.base + '/events', { headers: { Cookie: cookie } });
  assert.equal(ev.status, 200);
  const reader = ev.body.getReader();
  s.link.emit('ptyData', { ptyId: 'p1', data: 'hi' });
  let text = '';
  while (!text.includes('hi')) text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /event: ptyData/);
  assert.equal(s.link.unpair(s.link.devices()[0].id), true);
  assert.equal((await reader.read()).done, true);
  assert.equal((await s.post('/api/echo', [], { Cookie: cookie })).status, 401);
  await s.link.stop();
});

test('five wrong codes in a minute lock pairing, even for the right code, until the minute is over', async () => {
  const clock = { t: 5_000_000 };
  const s = await setup(clock);
  const good = s.link.newCode().code;
  for (let i = 0; i < 5; i++) assert.equal((await s.pairWith('wrong' + i)).status, 401);
  assert.equal((await s.pairWith(good)).status, 429);
  clock.t += 60 * 1000 + 1;
  assert.equal((await s.pairWith(good)).status, 200);
  await s.link.stop();
});

test('a method the phone may not call is refused, and an unknown one is not found', async () => {
  const s = await setup();
  const cookie = (await s.pairWith(s.link.newCode().code)).headers.get('set-cookie').split(';')[0];
  assert.equal((await s.post('/api/resume', [{}], { Cookie: cookie })).status, 403);
  assert.equal((await s.post('/api/nothing', [], { Cookie: cookie })).status, 404);
  assert.equal((await fetch(s.base + '/api/echo', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '[]' })).status, 415);
  assert.deepEqual(s.calls, []);
  await s.link.stop();
});

test('addresses names Tailscale and home addresses and falls back to this computer', () => {
  const a = addresses({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    tailscale0: [{ family: 'IPv4', internal: false, address: '100.101.2.3' }], wlan0: [{ family: 'IPv4', internal: false, address: '192.168.1.9' }] });
  assert.deepEqual(a.map((x) => x.address), ['192.168.1.9', '100.101.2.3']);
  assert.match(a[0].label, /Home Wi-Fi/);
  assert.match(a[1].label, /Tailscale/);
  assert.equal(addresses({ eth: [{ family: 'IPv4', internal: false, address: '100.128.0.1' }] })[0].label.startsWith('Home'), true);
  assert.equal(addresses({})[0].address, '127.0.0.1');
});
