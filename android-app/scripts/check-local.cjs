// Drives www/ in Chromium at phone size. Needs `playwright` and `qrcode` resolvable (NODE_PATH); not part of the app.
// usage: NODE_PATH=... node check-local.cjs <screenshot-dir>
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const QR = require('qrcode');
const { chromium } = require('playwright');

const www = path.join(__dirname, '..', 'www');
const out = process.argv[2] || '.';
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  const app = await listen((q, r) => {
    const route = q.url.split('?')[0];
    const f = path.join(www, route === '/' ? 'index.html' : route);
    if (!f.startsWith(www) || !fs.existsSync(f)) { r.writeHead(404).end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }).end(fs.readFileSync(f));
  });
  const pc = await listen((q, r) => r.writeHead(200, { 'access-control-allow-origin': '*' }).end('pc'));
  const hang = await listen(() => {}); // accepts, never answers
  const dead = await listen(() => {}); const deadPort = dead.address().port; dead.close();
  const appUrl = 'http://127.0.0.1:' + app.address().port + '/';
  const pcBase = 'http://127.0.0.1:' + pc.address().port;
  const pairUrl = pcBase + '/pair#one-time-code-123';
  const appQ = '?app=' + encodeURIComponent(appUrl.replace(/\/$/, '')); // what the app adds so the PC can send the phone back
  const qrDataUrl = await QR.toDataURL(pairUrl, { width: 400, margin: 4 });

  const browser = await chromium.launch();
  const mk = async (fakeCamera) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    await page.addInitScript(({ qr, fake }) => {
      window.__went = [];
      window.edensGo = (u) => window.__went.push(u);
      if (!fake) return;
      navigator.mediaDevices.getUserMedia = async () => { // a canvas showing the QR code stands in for the camera
        const c = document.createElement('canvas'); c.width = 480; c.height = 480;
        const g = c.getContext('2d'); const img = new Image(); img.src = qr;
        await img.decode(); g.drawImage(img, 40, 40, 400, 400);
        setInterval(() => g.drawImage(img, 40, 40, 400, 400), 100);
        return c.captureStream(10);
      };
    }, { qr: qrDataUrl, fake: fakeCamera });
    return page;
  };

  // 1. first run: scan -> saves base (no code) -> navigates to the pair URL
  let p = await mk(true);
  await p.goto(appUrl);
  await p.waitForFunction(() => window.__went.length === 1, null, { timeout: 8000 });
  assert.deepStrictEqual(await p.evaluate(() => window.__went), [pcBase + '/pair' + appQ + '#one-time-code-123']);
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('edens.base')), pcBase);
  console.log('PASS scan: decoded', pairUrl, 'saved', pcBase);
  await p.screenshot({ path: path.join(out, 'android-scan.png') });

  // 1b. the scan screen itself, no QR in view (blank camera) with Cancel and the address box
  p = await mk(false);
  await p.goto(appUrl);
  await p.waitForSelector('#scan:not([hidden])');
  await p.screenshot({ path: path.join(out, 'android-first-run.png') });
  await p.fill('#addr', '127.0.0.1:' + pc.address().port);
  await p.click('#go');
  assert.deepStrictEqual(await p.evaluate(() => window.__went), [pcBase + '/' + appQ]);
  console.log('PASS typed address saved and opened');

  // 2. later start: straight to the saved address
  p = await mk(false);
  await p.addInitScript((b) => localStorage.setItem('edens.base', b), pcBase);
  await p.goto(appUrl);
  await p.waitForFunction(() => window.__went.length === 1, null, { timeout: 8000 });
  assert.deepStrictEqual(await p.evaluate(() => window.__went), [pcBase + '/' + appQ]);
  console.log('PASS later start goes straight to', pcBase);

  // 3. dead address -> calm screen; and an address that never answers gives up after 5 s
  for (const [name, port, shot] of [['refused', deadPort, 'android-cant-reach.png'], ['silent', hang.address().port, 'android-cant-reach-timeout.png']]) {
    p = await mk(false);
    const base = 'http://127.0.0.1:' + port;
    await p.addInitScript((b) => localStorage.setItem('edens.base', b), base);
    const t0 = Date.now();
    await p.goto(appUrl);
    await p.waitForSelector('#lost:not([hidden])', { timeout: 9000 });
    const ms = Date.now() - t0;
    assert.ok(await p.getByText("Can't reach your PC").isVisible());
    assert.deepStrictEqual(await p.evaluate(() => window.__went), []);
    if (name === 'silent') assert.ok(ms >= 4800 && ms < 7500, 'gave up after ' + ms);
    console.log('PASS ' + name + ": \"Can't reach your PC\" after " + ms + ' ms');
    await p.screenshot({ path: path.join(out, shot) });
  }
  // 4. the PC sent the phone back with ?rescan=1: saved address removed, URL cleaned, scan screen shown
  p = await mk(false);
  await p.addInitScript((b) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('edens.base', b); sessionStorage.setItem('seeded', '1'); } }, pcBase);
  await p.goto(appUrl + '?rescan=1');
  await p.waitForSelector('#scan:not([hidden])');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('edens.base')), null);
  assert.strictEqual(await p.evaluate(() => location.search), '');
  assert.deepStrictEqual(await p.evaluate(() => window.__went), []);
  console.log('PASS ?rescan=1 forgets the saved address and shows the scan screen');
  await browser.close();
  app.close(); pc.close(); hang.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
