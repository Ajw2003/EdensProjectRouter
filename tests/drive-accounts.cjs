'use strict';
// Drives the packaged Linux app (issue #32) with two fake account folders and a stand-in for claude.
// Usage: NODE_PATH=<global node_modules> xvfb-run -a node tests/drive-accounts.cjs <path to the packaged executable>
// Writes docs/generated/accounts-*.png and prints one PASS/FAIL line per check.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright');

const repo = path.resolve(__dirname, '..');
const out = path.join(repo, 'docs', 'generated');
const exe = process.argv[2];
const U1 = '11111111-1111-4111-8111-111111111111'; // lives on .claude
const U2 = '22222222-2222-4222-8222-222222222222'; // lives on .claude-two, which is full
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + detail)); };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'acct-home-'));
const proj = { alpha: path.join(home, 'work', 'alpha'), beta: path.join(home, 'work', 'beta') };
for (const p of Object.values(proj)) fs.mkdirSync(p, { recursive: true });
const dirName = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');
const now = Date.now();
function transcript(id, cwd, title, hello) {
  const t = (ms) => new Date(now - ms).toISOString();
  return [
    { type: 'user', message: { role: 'user', content: hello }, cwd, sessionId: id, timestamp: t(120000) },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier reply about ' + title }] }, cwd, sessionId: id, timestamp: t(100000) },
    { type: 'ai-title', aiTitle: title, sessionId: id },
  ].map((o) => JSON.stringify(o)).join('\n') + '\n';
}
function account(name, id, cwd, title, hello, email, five, week) {
  const d = path.join(home, name);
  const pd = path.join(d, 'projects', dirName(cwd));
  fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, id + '.jsonl'), transcript(id, cwd, title, hello));
  fs.mkdirSync(path.join(d, 'router', 'status'), { recursive: true });
  const reset = Math.floor(now / 1000) + 3 * 3600;
  fs.writeFileSync(path.join(d, 'router', 'status', 'one.json'), JSON.stringify({ session_id: id, savedAtMs: now - 1000, rate_limits: { five_hour: { used_percentage: five, resets_at: reset }, seven_day: { used_percentage: week, resets_at: reset + 86400 } } }));
  fs.writeFileSync(name === '.claude' ? path.join(home, '.claude.json') : path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email } }));
}
account('.claude', U1, proj.alpha, 'Alpha work', 'Please start the alpha work', 'one@example.com', 20, 10);
account('.claude-two', U2, proj.beta, 'Beta work', 'Please continue the beta work', 'two@example.com', 100, 40);

// The stand-in for claude: logs how it was started, keeps its transcript in the account it runs on.
const bin = path.join(home, 'bin');
fs.mkdirSync(bin);
const claude = path.join(bin, 'claude');
fs.writeFileSync(claude, [
  '#!/bin/sh',
  'D="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"',
  'echo "cfg=${CLAUDE_CONFIG_DIR:-DEFAULT} cwd=$PWD args=$*" >> "$HOME/claude-calls.log"',
  'P="$D/projects/$(echo "$PWD" | sed "s/[^A-Za-z0-9]/-/g")"; mkdir -p "$P"',
  'if [ "$1" = "--resume" ]; then F="$P/$2.jsonl"; else F="$P/33333333-3333-4333-8333-$(date +%s%N | cut -c1-12).jsonl"; fi',
  'FAKE_TRANSCRIPT="$F" exec node "' + path.join(repo, 'tests', 'fake-claude.cjs') + '" visual',
].join('\n') + '\n', { mode: 0o755 });

const calls = () => { try { return fs.readFileSync(path.join(home, 'claude-calls.log'), 'utf8').trim().split('\n'); } catch (e) { return []; } };
const shot = async (page, name) => { await page.screenshot({ path: path.join(out, 'accounts-' + name + '.png') }); console.log('shot accounts-' + name + '.png'); };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const app = await _electron.launch({
    executablePath: exe, args: ['--no-sandbox'],
    env: { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 850 }).catch(() => {});
  await page.evaluate(() => localStorage.setItem('router.walkthroughDone', '1'));
  await page.reload();
  await page.waitForSelector('.srow', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, 'list');

  // 1. Each session opens on its own account.
  await page.locator('.srow', { hasText: 'Alpha work' }).first().click();
  await page.locator('.st-resume').first().click();
  await page.waitForFunction(() => document.querySelector('.st-term')?.textContent?.includes('ready'), null, { timeout: 20000 }).catch(() => {});
  await page.locator('.srow', { hasText: 'Beta work' }).first().click({ modifiers: ['Control'] });
  await page.locator('.pane').nth(1).locator('.st-resume').click();
  await page.waitForTimeout(2500);
  const c1 = calls();
  check('Alpha session resumed on .claude', c1.some((l) => l.includes('cfg=DEFAULT') && l.includes('--resume ' + U1)), c1.join(' | '));
  check('Beta session resumed on .claude-two', c1.some((l) => l.includes('.claude-two') && l.includes('--resume ' + U2)), c1.join(' | '));
  await shot(page, 'two-sessions');

  // 2. The full account shows the orange button in the header and in the Visual view.
  const beta = page.locator('.pane').nth(1);
  const head = beta.locator('.pane-bar .continue-btn');
  await head.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  check('header button reads Continue on one@example.com', (await head.textContent().catch(() => '')) === 'Continue on one@example.com', await head.textContent().catch(() => 'missing'));
  check('Alpha (has room) has no button', !(await page.locator('.pane').nth(0).locator('.continue-btn:visible').count()), 'button shown');
  await beta.locator('.pane-mode', { hasText: 'Visual' }).click();
  await page.waitForTimeout(2500);
  check('Visual view shows the button too', (await beta.locator('.pane-visual .continue-btn:visible').count()) === 1, 'not shown');
  await shot(page, 'full-account-visual');

  // 3. One tap continues on the other account; the earlier messages stay visible.
  await beta.locator('.pane-visual .continue-btn').click();
  await page.waitForTimeout(6000);
  const c2 = calls();
  check('Beta resumed on the default account after the tap', c2.filter((l) => l.includes('cfg=DEFAULT') && l.includes('--resume ' + U2)).length === 1, c2.join(' | '));
  check('transcript copied to the other account', fs.readdirSync(path.join(home, '.claude', 'projects', dirName(proj.beta))).includes(U2 + '.jsonl'), 'no file');
  await beta.locator('.pane-mode', { hasText: 'Visual' }).click();
  await page.waitForTimeout(3000);
  check('earlier messages visible after the handoff', ((await beta.locator('.vz-log').textContent()) || '').includes('Earlier reply about Beta work'), await beta.locator('.vz-log').textContent());
  check('button gone after the handoff', (await beta.locator('.continue-btn:visible').count()) === 0, 'still shown');
  await shot(page, 'after-handoff');

  // 4. New session box: Suggested, change it, Start.
  await page.locator('#new-session').click();
  await page.locator('dialog[open]').waitFor({ timeout: 10000 });
  const dlg = (await page.locator('dialog[open]').textContent()) || '';
  check('box marks one@example.com as Suggested', /one@example\.com · Suggested/.test(dlg) && !/two@example\.com · Suggested/.test(dlg), dlg);
  await page.locator('dialog[open] .grid-choice', { hasText: 'two@example.com' }).locator('input').check();
  await shot(page, 'new-session-box');
  await page.locator('dialog[open] button', { hasText: 'Start' }).click();
  await page.waitForTimeout(3500);
  const c3 = calls();
  check('new session started on the chosen .claude-two', c3.some((l) => l.includes('.claude-two') && !l.includes('--resume')), c3.join(' | '));
  await shot(page, 'new-session-started');

  // 5. Add account refuses an account already added.
  await page.locator('#shell-more').click();
  await shot(page, 'more-menu');
  await page.locator('[role=menuitem]', { hasText: 'Add account' }).click();
  await page.locator('dialog[open] input').fill('two');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForSelector('#notice:not([hidden])', { timeout: 10000 }).catch(() => {});
  const note = (await page.locator('#notice-text').textContent()) || '';
  check('Add account refuses a duplicate folder', /already added/.test(note), note);
  check('no duplicate folder was made', !fs.existsSync(path.join(home, '.claude-two-2')), 'made');
  await shot(page, 'duplicate-refused');

  await app.close();
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('DRIVE ERROR', e); process.exit(2); });
