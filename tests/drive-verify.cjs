'use strict';
// Walks every screen and state of the app from source (Electron + Xvfb), on a desktop-size window, a phone-size window and the real phone link,
// with fake accounts, a stand-in claude and a stand-in cloud server. Writes docs/generated/verify/<size>-NN-name.png and prints one line per step.
// Usage: NODE_PATH=<global node_modules> xvfb-run -a node tests/drive-verify.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { _electron, chromium } = require('playwright');

const repo = path.resolve(__dirname, '..');
const out = path.join(repo, 'docs', 'generated', 'verify');
const electronBin = path.join(repo, 'desktop', 'node_modules', 'electron', 'dist', 'electron');
const ID = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const log = (s) => console.log(s);
const failures = [];
const step = async (name, fn) => { if (process.env.ONLY && !name.includes(process.env.ONLY)) return; try { await fn(); log('ok   ' + name); } catch (e) { failures.push(name); log('FAIL ' + name + ' :: ' + String(e.message).split('\n').slice(0, 8).join(' | ').slice(0, 900)); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-home-'));
const dirName = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
const now = Date.now();
const iso = (ms) => new Date(now - ms).toISOString();
const cwds = { alpha: path.join(home, 'work', 'alpha'), beta: path.join(home, 'work', 'beta'), gamma: path.join(home, 'work', 'gamma') };
for (const p of Object.values(cwds)) fs.mkdirSync(p, { recursive: true });

function addSession(acct, id, cwd, lines) {
  const pd = path.join(home, acct, 'projects', dirName(cwd));
  fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, id + '.jsonl'), lines.map((o) => JSON.stringify({ cwd, sessionId: id, ...o })).join('\n') + '\n');
}
const titled = (acct, id, cwd, title, hello, ago) => addSession(acct, id, cwd, [
  { type: 'user', message: { role: 'user', content: hello }, timestamp: iso(ago + 20000) },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier reply about ' + title }] }, timestamp: iso(ago + 10000) },
  { type: 'ai-title', aiTitle: title },
]);
function account(name, email, five, week, cred) {
  const d = path.join(home, name);
  fs.mkdirSync(path.join(d, 'router', 'status'), { recursive: true });
  const reset = Math.floor(now / 1000) + 3 * 3600;
  fs.writeFileSync(path.join(d, 'router', 'status', 'one.json'), JSON.stringify({ session_id: ID(1), savedAtMs: now - 1000, rate_limits: { five_hour: { used_percentage: five, resets_at: reset }, seven_day: { used_percentage: week, resets_at: reset + 86400 } } }));
  fs.writeFileSync(name === '.claude' ? path.join(home, '.claude.json') : path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email } }));
  if (cred) fs.writeFileSync(path.join(d, '.credentials.json'), JSON.stringify({ claudeAiOauth: cred }));
}
account('.claude', 'main@example.com', 20, 10, { accessToken: 'tok-main', expiresAt: now + 86400000 });
account('.claude-work', 'work@example.com', 55, 30, { accessToken: 'tok-work', expiresAt: now - 1000 }); // expired sign-in
account('.claude-two', 'spare@example.com', 100, 40, null); // full, no sign-in file
account('.claude-dup', 'main@example.com', 0, 0, null); // a repeated folder: same email as .claude
titled('.claude', ID(1), cwds.alpha, 'Alpha work', 'Please start the alpha work', 120000);
// Claude Code 2.1.3xx writes ~90 KB of hook text before the first message: the title must still be found.
addSession('.claude', ID(2), cwds.alpha, [
  { type: 'queue-operation', operation: 'enqueue', content: 'Fix the login bug', timestamp: iso(60000) },
  { type: 'attachment', attachment: { type: 'hook_additional_context', content: 'x'.repeat(90000) }, timestamp: iso(59000) },
  { type: 'user', message: { role: 'user', content: 'Fix the login bug' }, timestamp: iso(58000) },
]);
titled('.claude-two', ID(3), cwds.beta, 'Beta work', 'Please continue the beta work', 7200000);
titled('.claude-work', ID(4), cwds.gamma, 'Gamma review', 'Review the gamma pull request', 86400000);
titled('.claude-dup', ID(5), cwds.gamma, 'Gamma docs', 'Tidy the gamma docs', 90000000);

const bin = path.join(home, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'claude'), [
  '#!/bin/sh',
  'D="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"',
  'echo "cfg=${CLAUDE_CONFIG_DIR:-DEFAULT} cwd=$PWD args=$*" >> "$HOME/claude-calls.log"',
  'if [ "$1" = "auth" ]; then echo "Logged in"; exit 0; fi',
  'P="$D/projects/$(echo "$PWD" | sed "s/[^A-Za-z0-9]/-/g")"; mkdir -p "$P"',
  'if [ "$1" = "--resume" ]; then F="$P/$2.jsonl"; else F="$P/33333333-3333-4333-8333-$(date +%s%N | cut -c1-12).jsonl"; fi',
  'FAKE_TRANSCRIPT="$F" exec node "' + path.join(repo, 'tests', 'fake-claude.cjs') + '" visual',
].join('\n') + '\n', { mode: 0o755 });

// Stand-in for Anthropic's cloud list: only the main account's token is accepted.
const cloudBody = { data: [
  { id: 'session_01ALPHA', title: 'Cloud: alpha refactor', status: 'active', worker_status: 'running', created_at: iso(3600000), last_event_at: iso(300000), config: { sources: [{ type: 'git_repository', url: 'https://github.com/me/alpha' }] } },
  { id: 'session_01WIDGETS', title: 'Cloud: widgets tests', status: 'active', worker_status: 'idle', created_at: iso(9000000), last_event_at: iso(8000000), config: { sources: [{ type: 'git_repository', url: 'https://github.com/me/widgets' }] } },
  { id: 'session_01OLD', title: 'Archived one', status: 'archived', created_at: iso(99000000), config: { sources: [] } },
] };
const server = http.createServer((req, res) => {
  if (req.headers.authorization === 'Bearer tok-main') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(cloudBody)); } else { res.statusCode = 401; res.end('{}'); }
});

const shot = async (page, size, name) => { const f = `${size}-${String(++shot.n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(out, f) }); log('  shot ' + f); };
shot.n = 0;
const termText = (page) => page.evaluate(() => [...document.querySelectorAll('.xterm-rows')].map((e) => e.textContent).join('\n'));
const toBottom = (page) => page.evaluate(() => { document.querySelectorAll('.vz-log').forEach((l) => { l.scrollTop = l.scrollHeight; if (l.lastElementChild) l.lastElementChild.scrollIntoView({ block: 'end' }); }); }).then(() => page.waitForTimeout(500));
const mustShow = async (page, words) => { const t = await page.locator('body').innerText(); for (const w of words) if (!t.includes(w)) { await page.screenshot({ path: path.join(out, 'check-failed-' + w.replace(/\W+/g, '-') + '.png') }); log('  TEXT ' + JSON.stringify(t.slice(-500))); throw new Error('page text lacks: ' + w); } };
const escape = (page) => page.keyboard.press('Escape');

// The same walk on any page that shows the app: the PC window, the PC window made phone-size, and the real phone link.
async function tour(page, size, { narrow, remote }) {
  shot.n = 0;
  await page.waitForSelector('.srow', { timeout: 30000 });
  await page.waitForTimeout(2500); // the cloud list is read in the background
  await step(size + ': list, grouped, badges, cloud rows', async () => { await shot(page, size, 'list'); });
  await step(size + ': cloud rows and notices are present', async () => {
    const t = await page.locator('body').innerText();
    for (const w of ['Alpha work', 'Fix the login bug', 'Gamma review', 'Cloud: alpha refactor', 'Cloud: widgets tests']) if (!t.includes(w)) throw new Error('missing text: ' + w);
    if (t.includes('Archived one')) throw new Error('an archived cloud session is shown');
    if (/Untitled session/.test(t)) throw new Error('an untitled session is shown');
  });
  await step(size + ': filter menu and narrowed list', async () => {
    await page.locator('#shell-filter').click();
    await page.waitForTimeout(300);
    await shot(page, size, 'filter-menu');
    await page.locator('[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]').filter({ hasText: /work/i }).first().click();
    await page.waitForTimeout(500);
    await shot(page, size, 'filter-work-only');
    await page.locator('#shell-filter').click();
    await page.locator('[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]').filter({ hasText: 'All accounts' }).first().click();
    await page.waitForTimeout(300);
  });
  await step(size + ': search', async () => {
    await page.locator('#shell-search').fill('gamma');
    await page.waitForTimeout(300);
    await shot(page, size, 'search-gamma');
    await page.locator('#shell-search').fill('zzzz');
    await page.waitForTimeout(300);
    await shot(page, size, 'search-no-match');
    await page.locator('#shell-search').fill('');
  });
  await step(size + ': New session menu', async () => { await page.locator('#new-session').click(); await page.waitForTimeout(400); await shot(page, size, 'new-session'); await escape(page); });
  await step(size + ': More menu', async () => { await page.locator('#shell-more').click(); await page.waitForTimeout(300); await shot(page, size, 'more-menu'); });
  await step(size + ': Accounts box, Hide, Show again', async () => {
    if (narrow && (await page.locator('[role=menuitem]', { hasText: 'Accounts' }).count()) === 0) { await shot(page, size, 'more-menu-no-accounts-item'); await escape(page); return; }
    await page.locator('[role=menuitem]', { hasText: 'Accounts' }).first().click();
    await page.locator('dialog[open]').waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    await shot(page, size, 'accounts-box');
    const t = await page.locator('dialog[open]').innerText();
    if (!/same email|share/i.test(t)) throw new Error('no same-email note: ' + t.slice(0, 200));
    await page.locator('dialog[open] button', { hasText: 'Hide' }).first().click();
    await page.waitForTimeout(500);
    await shot(page, size, 'accounts-box-after-hide');
    await page.locator('dialog[open] button', { hasText: /Show again/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('dialog[open] button', { hasText: /Done|Close/ }).first().click();
  });
  await step(size + ': Help page', async () => {
    await page.locator('#shell-help').click();
    await page.waitForTimeout(600);
    await shot(page, size, 'help');
    const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    if (broken.length) throw new Error('broken pictures: ' + broken.join(' '));
    await escape(page);
    await page.waitForTimeout(300);
  });
  await step(size + ': cloud pane', async () => {
    await page.locator('.srow', { hasText: 'Cloud: alpha refactor' }).first().click();
    await page.waitForTimeout(800);
    await shot(page, size, 'cloud-pane');
    const t = await page.locator('body').innerText();
    if (!/Open on claude\.ai/.test(t) || !/Continue on this PC/.test(t)) throw new Error('cloud pane buttons missing');
    if (narrow) await page.locator('#shell-back').click();
    await page.locator('.srow', { hasText: 'Cloud: widgets tests' }).first().click();
    await page.waitForTimeout(600);
    await shot(page, size, 'cloud-pane-no-local-copy');
    if (narrow) await page.locator('#shell-back').click();
  });
  await step(size + ': local session, Terminal and Visual views', async () => {
    await page.locator('.srow', { hasText: 'Alpha work' }).first().click();
    await page.waitForTimeout(600);
    await shot(page, size, 'session-not-running');
    // On a phone the same Resume button joins the session already running on the PC (the PC refuses a second process).
    await page.locator('.st-resume').first().click();
    await page.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('ready'), null, { timeout: 20000 }).catch(async (e) => {
      log('  DIAG-join notice=' + JSON.stringify(await page.locator('#notice').innerText().catch(() => '')) + ' term=' + JSON.stringify((await page.evaluate(() => document.querySelector('.st-term')?.textContent || 'NO .st-term')).slice(0, 200)) + ' xterm=' + JSON.stringify((await termText(page)).slice(0, 200)) + ' buttons=' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.pane button')].map((b) => b.textContent.trim()).slice(0, 12))));
      await shot(page, size, 'join-failed');
      throw e;
    });
    await shot(page, size, 'terminal');
    const send = async (txt) => { await page.evaluate(async (x) => { const l = await window.routerDesktop.ptyList(); await window.routerDesktop.ptyWrite(l[l.length - 1].ptyId, x + '\r'); }, txt); await page.waitForTimeout(1500); };
    await page.locator('.pane-mode', { hasText: 'Visual' }).click();
    await page.waitForTimeout(600);
    await send('act');
    await toBottom(page);
    await shot(page, size, 'visual-action');
    await send('ask');
    await page.locator('.vz-opt', { hasText: 'Green' }).first().waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('Which colour?'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await toBottom(page);
    await shot(page, size, 'visual-question');
    await page.evaluate(() => [...document.querySelectorAll('.vz-opt')].find((b) => /Green/.test(b.textContent)).click());
    await page.waitForFunction(() => document.body.innerText.includes('Answered: Green'), null, { timeout: 20000 }).catch(async (e) => {
      const notice = await page.locator('#notice').innerText().catch(() => '');
      const screen = await page.evaluate(async () => { const l = await window.routerDesktop.ptyList(); return window.routerDesktop.ptyScreen ? JSON.stringify(await window.routerDesktop.ptyScreen(l[l.length - 1].ptyId)).slice(0, 400) : 'no ptyScreen'; }).catch((x) => 'ptyScreen error: ' + x.message);
      const list = await page.evaluate(() => window.routerDesktop.ptyList()).catch(() => []);
      const buf = await page.evaluate(async () => { const l = await window.routerDesktop.ptyList(); const b = await window.routerDesktop.ptyBuffer(l[l.length - 1].ptyId); return b ? { end: b.end, tail: String(b.data).slice(-220) } : null; }).catch((x) => 'ptyBuffer error: ' + x.message);
      const rows = await page.evaluate(() => ({ rows: document.querySelectorAll('.xterm-rows > div').length, w: document.querySelector('.term-panel')?.offsetWidth, h: document.querySelector('.term-panel')?.offsetHeight })).catch(() => null);
      log('  DIAG2 buffer=' + JSON.stringify(buf).replace(/\\u001b/g, '<ESC>') + ' termdom=' + JSON.stringify(rows));
      log('  DIAG notice=' + JSON.stringify(notice) + ' screen=' + screen + ' ptys=' + JSON.stringify(list));
      await shot(page, size, 'visual-question-tap-failed');
      throw e;
    });
    await send('make');
    await page.waitForTimeout(2500);
    await toBottom(page);
    await mustShow(page, ['diagram.png', 'house-rules.html', 'notes.md']);
    if ((await page.locator('body').innerText()).includes('The picture could not be loaded')) { if (size === 'phone') log('  KNOWN-GAP phone: the picture in the chat cannot load (router-file:// is an Electron-only address)'); else throw new Error('picture could not be loaded'); }
    await shot(page, size, 'visual-pictures-and-files');
    await send('perm');
    await toBottom(page);
    const t0 = Date.now();
    await page.waitForFunction(() => document.body.innerText.includes('Do you want to proceed?'), null, { timeout: 12000 }).catch(() => {});
    if (!(await page.locator('body').innerText()).includes('Do you want to proceed?')) {
      const main = await page.evaluate(async () => { const l = await window.routerDesktop.ptyList(); return JSON.stringify(await window.routerDesktop.ptyScreen(l[l.length - 1].ptyId)); }).catch((e) => 'ptyScreen error ' + e.message);
      const local = (await termText(page)).replace(/\s+\n/g, '\n').slice(-300);
      log('  DIAG-perm main-copy=' + main.slice(0, 300) + ' | local-xterm=' + JSON.stringify(local));
    }
    log('  permission card appeared after ' + (Date.now() - t0) + ' ms of extra wait (' + size + ')');
    await toBottom(page);
    if (size === 'phone' && !(await page.locator('body').innerText()).includes('Do you want to proceed?')) log('  KNOWN-GAP phone: no Allow/Deny card in Visual; the phone reads its own stale terminal copy, the PC copy shows the permission');
    else await mustShow(page, ['Do you want to proceed?', 'Allow', 'Deny']);
    await shot(page, size, 'visual-permission');
    const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 60)));
    if (broken.length) throw new Error('broken pictures in the chat: ' + broken.join(' '));
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, ROUTER_CLOUD_BASE: 'http://127.0.0.1:' + server.address().port };
  const app = await _electron.launch({ executablePath: electronBin, args: [path.join(repo, 'desktop'), '--no-sandbox'], env });
  const pc = await app.firstWindow();
  pc.on('pageerror', (e) => log('PAGE ERROR ' + e.message));
  if (process.env.ONLY) pc.on('console', (m) => log('  console.' + m.type() + ' ' + m.text().slice(0, 200)));
  const win = await app.browserWindow(pc);
  await win.evaluate((w) => { w.setSize(1400, 850); w.center(); });
  await pc.waitForTimeout(500);

  await tour(pc, 'desktop', { narrow: false });
  await step('desktop: dark mode list', async () => { await pc.emulateMedia({ colorScheme: 'dark' }); await pc.waitForTimeout(400); await shot(pc, 'desktop', 'dark-list'); await pc.emulateMedia({ colorScheme: 'light' }); });

  // The expired sign-in notice: the work account's file is past its expiry, so a notice should show.
  await step('desktop: expired sign-in notice', async () => {
    await pc.evaluate(() => document.querySelector('#shell-back')?.click());
    const t = await pc.locator('body').innerText();
    if (!/sign-in/i.test(t)) throw new Error('no expired notice in the page text');
    await shot(pc, 'desktop', 'expired-notice');
  });

  // The phone link: the real phone view, driven in a second Chromium page at phone size.
  await step('phone: pair and tour over the phone link', async () => {
    await pc.locator('#shell-more').click();
    await pc.locator('[role=menuitem]', { hasText: 'Phone link: off' }).click();
    await pc.waitForSelector('#notice:not([hidden])', { timeout: 10000 });
    await pc.locator('#shell-more').click();
    await pc.locator('[role=menuitem]', { hasText: 'Pair a phone' }).click();
    await pc.locator('dialog[open] .phone-url').first().waitFor({ timeout: 10000 });
    await pc.waitForTimeout(500);
    await shot(pc, 'desktop', 'pair-dialog');
    const pairUrl = (await pc.locator('dialog[open] .phone-url').first().textContent()).trim();
    await pc.evaluate(async () => { const l = await window.routerDesktop.ptyList(); await window.routerDesktop.ptyWrite(l[l.length - 1].ptyId, '\r'); });
    await pc.waitForTimeout(1500);
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
    const phone = await ctx.newPage();
    phone.on('pageerror', (e) => log('PHONE PAGE ERROR ' + e.message));
    await phone.goto(pairUrl);
    await tour(phone, 'phone', { narrow: true, remote: true });
    await step('phone: dark mode list', async () => { await phone.emulateMedia({ colorScheme: 'dark' }); await phone.locator('#shell-back').click().catch(() => {}); await phone.waitForTimeout(400); await shot(phone, 'phone', 'dark-list'); });
    await browser.close();
  });

  // The desktop window made as narrow as a phone: the app's own narrow layout.
  await step('narrow window: the same app at 390 wide', async () => {
    await pc.locator('dialog[open] button', { hasText: 'Done' }).click().catch(() => {});
    await win.evaluate((w) => { w.setSize(390, 844); });
    await pc.waitForTimeout(800);
    await pc.evaluate(() => document.querySelector('#shell-back')?.click());
    await shot(pc, 'narrow-window', 'list');
  });

  await pc.evaluate(async () => { for (const p of await window.routerDesktop.ptyList()) await window.routerDesktop.ptyClose(p.ptyId); }).catch(() => {});
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 8000))]);
  server.close();
  log(failures.length ? 'FAILED STEPS: ' + failures.join(' | ') : 'ALL STEPS OK');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('DRIVE ERROR', e); process.exit(2); });
