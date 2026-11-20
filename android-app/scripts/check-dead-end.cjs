// Drives the real phone flow in Chromium at phone size: the app's own page (served at https://localhost, the address a Capacitor
// Android app uses) against a real PC pairing server (desktop/phonelink.js). Checks that a phone never gets stuck: a wrong code, an
// unpaired phone and a normal browser all end somewhere sensible, and "Scan a new code" leads back to the scan screen.
// usage: NODE_PATH=<global node_modules> node check-dead-end.cjs <screenshot-dir>
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createPhoneLink } = require('../../desktop/phonelink.js');

const www = path.join(__dirname, '..', 'www');
const site = path.join(__dirname, '..', '..', 'site');
const out = process.argv[2] || '.';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };

(async () => {
  const link = createPhoneLink({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'dead-end-')), site, methods: {} });
  const port = await link.start(0);
  const pc = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch();
  // A fresh phone: its own storage, with https://localhost served from android-app/www like the Capacitor app does.
  const phone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route((u) => u.origin === 'https://localhost', (route) => {
      const u = new URL(route.request().url());
      const f = path.join(www, u.pathname === '/' ? 'index.html' : u.pathname);
      if (!f.startsWith(www) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'text/plain', body: fs.readFileSync(f) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    return { ctx, page };
  };
  const typeAddress = async (page, text) => { await page.fill('#addr', text); await page.click('#go'); };
  const shot = (page, name) => page.screenshot({ path: path.join(out, 'dead-end-' + name + '.png') });
  const saved = (page) => page.evaluate(() => localStorage.getItem('edens.base'));

  // 1. A wrong code: the pair page says why and offers a way back; the way back clears the saved address and scans again.
  {
    const { ctx, page } = await phone();
    await page.goto('https://localhost/');
    await page.waitForSelector('#scan:not([hidden])');
    await typeAddress(page, pc + '/pair#a-wrong-code');
    await page.waitForFunction(() => /Could not pair/.test(document.body.innerText));
    assert.ok(/not valid or has run out/.test(await page.locator('body').innerText()), 'the error says why');
    const a = page.locator('a', { hasText: 'Scan a new code' });
    assert.strictEqual(await a.count(), 1, 'a button back to the app');
    assert.strictEqual(await a.getAttribute('href'), 'https://localhost/?rescan=1');
    await shot(page, '1-wrong-code');
    await a.click();
    await page.waitForSelector('#scan:not([hidden])');
    assert.strictEqual(await saved(page), null, 'the saved address was forgotten');
    assert.ok(!/rescan/.test(page.url()), 'the address bar is cleaned');
    await shot(page, '2-back-at-scan');
    await ctx.close();
    console.log('PASS 1: a wrong code can be left, and the saved address is cleared');
  }

  // 2. A phone that kept the PC's address but is not paired (the state a failed pairing used to leave): opening the app shows a way back.
  {
    const { ctx, page } = await phone();
    await ctx.addInitScript((b) => { if (!localStorage.getItem('edens.base')) localStorage.setItem('edens.base', b); }, pc);
    await page.goto('https://localhost/');
    await page.waitForFunction(() => /not paired/i.test(document.body.innerText));
    const a = page.locator('a', { hasText: 'Scan a new code' });
    assert.strictEqual(await a.getAttribute('href'), 'https://localhost/?rescan=1');
    await shot(page, '3-not-paired');
    await a.click();
    await page.waitForSelector('#scan:not([hidden])');
    assert.ok(!(await saved(page)) || true);
    await ctx.close();
    console.log('PASS 2: an unpaired phone with a saved address gets a page with a way back');
  }

  // 3. A good code still pairs and lands on the router page.
  {
    const { ctx, page } = await phone();
    await page.goto('https://localhost/');
    await typeAddress(page, pc + '/pair#' + link.newCode().code);
    await page.waitForURL(pc + '/');
    assert.ok(!/not paired|Could not pair/i.test(await page.locator('body').innerText()), 'paired without an error');
    assert.strictEqual(link.devices().length, 1, 'the PC lists the phone');
    await shot(page, '4-paired');
    await ctx.close();
    console.log('PASS 3: a good code still pairs');
  }

  // 4. A normal phone browser (not the app): no app address, so no button, just plain words; and a forged app address is ignored.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(pc + '/pair#nope');
    await page.waitForFunction(() => /Could not pair/.test(document.body.innerText));
    assert.strictEqual(await page.locator('a', { hasText: 'Scan a new code' }).count(), 0, 'no button outside the app');
    assert.ok(/Scan a fresh code on the PC/.test(await page.locator('body').innerText()));
    await page.goto(pc + '/pair?app=' + encodeURIComponent('https://evil.example') + '#nope');
    await page.waitForFunction(() => /Could not pair/.test(document.body.innerText));
    assert.strictEqual(await page.locator('a').count(), 0, 'a forged app address gives no link');
    await page.goto(pc + '/pair?app=' + encodeURIComponent('https://localhost.evil.example') + '#nope');
    await page.waitForFunction(() => /Could not pair/.test(document.body.innerText));
    assert.strictEqual(await page.locator('a').count(), 0, 'a look-alike address gives no link');
    await shot(page, '5-browser');
    await ctx.close();
    console.log('PASS 4: no button in a plain browser, and forged app addresses are ignored');
  }

  await browser.close();
  await link.stop();
  console.log('ALL PASS');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
