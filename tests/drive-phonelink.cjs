'use strict';
// Drives the packaged Linux app (issue #37): the PC turns Phone link on and shows the pair dialog; a second Chromium page
// at 390x844 stands in for the phone, pairs, opens the running session, switches to Visual and taps an answer.
// Usage: NODE_PATH=<global node_modules> xvfb-run -a node tests/drive-phonelink.cjs <path to the packaged executable>
// Writes docs/generated/phone-*.png and prints one PASS/FAIL line per check.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron, chromium } = require('playwright');

const repo = path.resolve(__dirname, '..');
const out = path.join(repo, 'docs', 'generated');
const exe = process.argv[2];
const U1 = '11111111-1111-4111-8111-111111111111';
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + detail)); };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-home-'));
const cwd = path.join(home, 'work', 'alpha');
fs.mkdirSync(cwd, { recursive: true });
const dirName = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
const pd = path.join(home, '.claude', 'projects', dirName(cwd));
fs.mkdirSync(pd, { recursive: true });
const t = (ms) => new Date(Date.now() - ms).toISOString();
fs.writeFileSync(path.join(pd, U1 + '.jsonl'), [
  { type: 'user', message: { role: 'user', content: 'Please start the alpha work' }, cwd, sessionId: U1, timestamp: t(120000) },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier reply about Alpha work' }] }, cwd, sessionId: U1, timestamp: t(100000) },
  { type: 'ai-title', aiTitle: 'Alpha work', sessionId: U1 },
].map((o) => JSON.stringify(o)).join('\n') + '\n');
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'one@example.com' } }));

const bin = path.join(home, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'claude'), [
  '#!/bin/sh',
  'P="$HOME/.claude/projects/$(echo "$PWD" | sed "s/[^A-Za-z0-9]/-/g")"; mkdir -p "$P"',
  'if [ "$1" = "--resume" ]; then F="$P/$2.jsonl"; else F="$P/33333333-3333-4333-8333-$(date +%s%N | cut -c1-12).jsonl"; fi',
  'FAKE_TRANSCRIPT="$F" exec node "' + path.join(repo, 'tests', 'fake-claude.cjs') + '" visual',
].join('\n') + '\n', { mode: 0o755 });

const shot = async (page, name) => { await page.screenshot({ path: path.join(out, 'phone-' + name + '.png') }); console.log('shot phone-' + name + '.png'); };
const termText = (page) => page.evaluate(() => [...document.querySelectorAll('.xterm-rows')].map((e) => e.textContent).join('\n'));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const app = await _electron.launch({ executablePath: exe, args: ['--no-sandbox'], env: { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH } });
  const pc = await app.firstWindow();
  await pc.setViewportSize({ width: 1400, height: 850 }).catch(() => {});
  await pc.evaluate(() => localStorage.setItem('router.walkthroughDone', '1'));
  await pc.reload();
  await pc.waitForSelector('.srow', { timeout: 30000 });

  // The PC runs the session and asks the question.
  await pc.locator('.srow', { hasText: 'Alpha work' }).first().click();
  await pc.locator('.st-resume').first().click();
  await pc.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('ready'), null, { timeout: 20000 }).catch(() => {});
  await pc.evaluate(async () => { const [p] = await window.routerDesktop.ptyList(); await window.routerDesktop.ptyWrite(p.ptyId, 'ask\r'); });
  await pc.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('Which colour?'), null, { timeout: 20000 }).catch(() => {});

  // Phone link on, then the pair dialog.
  await pc.locator('#shell-more').click();
  await pc.locator('[role=menuitem]', { hasText: 'Phone link: off' }).click();
  await pc.waitForSelector('#notice:not([hidden])', { timeout: 10000 });
  await pc.locator('#shell-more').click();
  check('More menu shows the switch as on', (await pc.locator('[role=menuitem]', { hasText: 'Phone link: on' }).count()) === 1, 'not on');
  await pc.locator('[role=menuitem]', { hasText: 'Pair a phone' }).click();
  await pc.locator('dialog[open] .phone-url').first().waitFor({ timeout: 10000 });
  await pc.waitForTimeout(500);
  const urls = await pc.locator('dialog[open] .phone-url').allTextContents();
  const labels = await pc.locator('dialog[open] figcaption').allTextContents();
  check('dialog shows a QR with a labelled pair URL', urls.length >= 1 && /^http:\/\/[\d.]+:\d+\/pair#\S+$/.test(urls[0]) && /Home Wi-Fi|Tailscale|This computer/.test(labels[0]), urls.join(' ') + labels.join(' '));
  check('QR is drawn', (await pc.locator('dialog[open] img.phone-qr').first().evaluate((i) => i.complete && i.naturalWidth > 0)), 'no image');
  await shot(pc, 'pair-dialog');
  const pairUrl = urls[0];
  const base = new URL(pairUrl).origin;

  // The phone.
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  await ctx.addInitScript(() => { try { localStorage.setItem('router.walkthroughDone', '1'); } catch (e) { /* the pair page has no storage use */ } });
  const phone = await ctx.newPage();
  const unpaired = await (await browser.newContext()).request.get(base + '/');
  check('an unpaired fresh browser gets 401', unpaired.status() === 401, String(unpaired.status()));
  await phone.goto(pairUrl);
  await phone.waitForSelector('.srow', { timeout: 30000 });
  check('phone paired and sees the session list', (await phone.locator('.srow', { hasText: 'Alpha work' }).count()) >= 1, 'no row');
  check('phone is the remote stand-in', await phone.evaluate(() => window.routerDesktop.isRemote === true), 'not remote');
  await shot(phone, 'list');

  await phone.locator('.srow', { hasText: 'Alpha work' }).first().click();
  await phone.waitForSelector('.pane', { timeout: 10000 });
  check('narrow: one pane shown with a Back button', await phone.locator('#shell-back').isVisible() && !(await phone.locator('.shell-list').isVisible()), 'layout');
  await phone.locator('.pane-mode', { hasText: 'Terminal' }).click().catch(() => {});
  await phone.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('Which colour?'), null, { timeout: 20000 }).catch(() => {});
  await phone.locator('.pane-mode', { hasText: 'Visual' }).click();
  await phone.locator('.vz-opt', { hasText: 'Green' }).waitFor({ timeout: 20000 }).catch(() => {});
  check('phone Visual view shows the question', (await phone.locator('.vz-opt', { hasText: 'Green' }).count()) === 1, 'no card');
  await shot(phone, 'visual-question');

  phone.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('phone console:', m.text()); });
  await phone.locator('.vz-opt', { hasText: 'Green' }).click();
  await pc.waitForTimeout(2500);
  const phoneNotice = await phone.locator('#notice').textContent().catch(() => '');
  if (phoneNotice && phoneNotice.trim()) console.log('phone notice after the tap:', phoneNotice.trim());
  await pc.locator('dialog[open] button', { hasText: 'Done' }).click().catch(() => {});
  await pc.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('chose: Green'), null, { timeout: 15000 }).catch(() => {});
  const pcTerm = await termText(pc);
  check('PC terminal moved on and printed the choice', pcTerm.includes('chose: Green'), pcTerm.slice(0, 300));
  await shot(pc, 'pc-terminal-after');

  // Unpair from the PC; the phone's next call fails.
  await pc.locator('#shell-more').click();
  await pc.locator('[role=menuitem]', { hasText: 'Pair a phone' }).click();
  await pc.locator('dialog[open] .phone-device').first().waitFor({ timeout: 10000 });
  check('dialog lists the paired phone by name', ((await pc.locator('dialog[open] .phone-device').first().textContent()) || '').includes('Pixel 8'), 'name');
  await pc.locator('dialog[open] button', { hasText: 'Unpair' }).click();
  await pc.waitForTimeout(1500);
  const after = await phone.evaluate(() => window.routerDesktop.ptyList().then(() => 'ok', (e) => e.message));
  check('after Unpair the phone call fails', after !== 'ok' && /not paired/.test(after), after);
  check('the phone can not fetch the page any more', (await ctx.request.get(base + '/')).status() === 401, 'still allowed');

  await browser.close();
  await app.close();
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('DRIVE ERROR', e); process.exit(2); });
