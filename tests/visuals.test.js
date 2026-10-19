import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { findVisuals, mergeVisuals, parseShows, kindOf, resolvePath, artifactLinks, routerFileUrl } from '../site/js/visualsfind.js';
import { parseTranscript } from '../site/js/transcript.js';
import { renderMarkdownDoc, safeHref } from '../site/js/markdownview.js';
import { hasNewVisuals, newestAt, sessionsByAccount } from '../site/js/tiles/visuals.js';

const require = createRequire(import.meta.url);
const guard = require('../desktop/filesguard.js');
const show = require('../desktop/showtool/server.cjs');

const tool = (name, p, at) => ({ kind: 'tool', name, path: p, at });

test('transcript keeps the file path of a tool call', () => {
  const line = JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [
    { type: 'tool_use', id: 'a', name: 'Write', input: { file_path: '/p/x.png', content: 'x' } },
    { type: 'tool_use', id: 'b', name: 'NotebookEdit', input: { notebook_path: '/p/n.ipynb' } },
    { type: 'tool_use', id: 'c', name: 'Bash', input: { command: 'ls' } }] } });
  const e = parseTranscript(line).entries;
  assert.equal(e[0].path, '/p/x.png');
  assert.equal(e[1].path, '/p/n.ipynb');
  assert.equal(e[2].path, undefined);
});

test('findVisuals: Write, Edit, MultiEdit and NotebookEdit count; Read and Bash do not', () => {
  const entries = [
    tool('Write', '/p/a.png', 1), tool('Edit', '/p/b.md', 2), tool('MultiEdit', '/p/c.html', 3), tool('NotebookEdit', '/p/d.pdf', 4),
    tool('Read', '/p/e.png', 5), tool('Bash', '/p/f.png', 6),
  ];
  const out = findVisuals(entries, { cwd: '/p', sessionId: 's1' });
  assert.deepEqual(out.map((v) => v.path), ['/p/d.pdf', '/p/c.html', '/p/b.md', '/p/a.png']);
  assert.deepEqual(out.map((v) => v.kind), ['pdf', 'html', 'markdown', 'image']);
  assert.equal(out[0].sessionId, 's1');
  assert.equal(out[0].at, 4);
});

test('findVisuals: extension filter is case-insensitive and covers every wanted type', () => {
  const names = ['a.PNG', 'b.Jpg', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg', 'g.mp4', 'h.webm', 'i.pdf', 'j.md', 'k.html', 'l.HTM'];
  const out = findVisuals(names.map((n, i) => tool('Write', '/p/' + n, i + 1)), { cwd: '/p' });
  assert.equal(out.length, 12);
  for (const n of ['a.txt', 'b.js', 'c.png.bak', 'd', 'e.json', 'f.ts']) assert.equal(kindOf(n), null, n);
  assert.deepEqual(findVisuals([tool('Write', '/p/a.txt', 1), tool('Write', '/p/b.js', 2)], { cwd: '/p' }), []);
});

test('findVisuals: relative paths use the cwd, . and .. are resolved, Windows paths keep backslashes', () => {
  assert.equal(resolvePath('out/a.png', '/work/proj'), '/work/proj/out/a.png');
  assert.equal(resolvePath('../a.png', '/work/proj'), '/work/a.png');
  assert.equal(resolvePath('./a.png', '/work/proj/'), '/work/proj/a.png');
  assert.equal(resolvePath('/abs/a.png', '/work'), '/abs/a.png');
  assert.equal(resolvePath('out\\a.png', 'C:\\Users\\aj\\proj'), 'C:\\Users\\aj\\proj\\out\\a.png');
  assert.equal(resolvePath('C:/x/../y/a.png', 'D:\\z'), 'C:\\y\\a.png');
  assert.equal(resolvePath('a.png', ''), '');
  assert.equal(resolvePath('a.png', 'relative'), '');
});

test('findVisuals: one entry per path (newest time), Windows paths compare without case', () => {
  const out = findVisuals([
    tool('Write', '/p/a.png', 5), tool('Edit', '/p/a.png', 9), tool('Write', '/p/a.png', 2),
    tool('Write', 'C:\\P\\b.png', 1), tool('Edit', 'c:/p/B.png', 3),
  ], { cwd: '/p' });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((v) => v.at), [9, 3]);
});

test('findVisuals: newest first', () => {
  const out = findVisuals([tool('Write', '/p/a.png', 1), tool('Write', '/p/b.png', 30), tool('Write', '/p/c.png', 20)], { cwd: '/p' });
  assert.deepEqual(out.map((v) => v.path), ['/p/b.png', '/p/c.png', '/p/a.png']);
});

test('findVisuals: claude.ai artifact links in Claude text, trailing punctuation cut, others ignored', () => {
  const out = findVisuals([
    { kind: 'claude', at: 7, text: 'Here: https://claude.ai/public/artifacts/abc-123. Also (https://claude.ai/artifact/xyz) and https://example.com/artifact/1 and https://claude.ai/chat/9' },
    { kind: 'you', at: 8, text: 'https://claude.ai/public/artifacts/from-me' },
  ], { cwd: '/p', sessionId: 's' });
  assert.deepEqual(out.map((v) => v.path), ['https://claude.ai/artifact/xyz', 'https://claude.ai/public/artifacts/abc-123']);
  assert.ok(out.every((v) => v.kind === 'artifact' && v.at === 7 && v.sessionId === 's'));
  assert.deepEqual(artifactLinks('no links'), []);
});

test('mergeVisuals: one per path across lists, newest first', () => {
  const m = mergeVisuals([{ path: '/p/a.png', kind: 'image', at: 1 }, { path: '/p/b.md', kind: 'markdown', at: 5 }], [{ path: '/p/a.png', kind: 'image', at: 9 }]);
  assert.deepEqual(m.map((v) => [v.path, v.at]), [['/p/a.png', 9], ['/p/b.md', 5]]);
});

test('parseShows: lines for the project cwd (or inside it) become entries; bad lines are counted', () => {
  const text = [
    JSON.stringify({ path: 'out/a.png', caption: 'one', cwd: '/w/proj', at: '2026-01-01T00:00:00.000Z' }),
    JSON.stringify({ path: '/w/proj/sub/b.md', caption: '', cwd: '/w/proj/sub', at: '2026-01-02T00:00:00.000Z' }),
    JSON.stringify({ path: 'c.png', cwd: '/w/other', at: '2026-01-03T00:00:00.000Z' }),
    JSON.stringify({ path: 'd.txt', cwd: '/w/proj', at: '2026-01-03T00:00:00.000Z' }),
    'not json', JSON.stringify({ cwd: '/w/proj' }), '',
  ].join('\n');
  const r = parseShows(text, ['/w/proj']);
  assert.deepEqual(r.entries.map((e) => e.path), ['/w/proj/sub/b.md', '/w/proj/out/a.png']);
  assert.equal(r.entries[1].caption, 'one');
  assert.equal(r.bad, 2);
});

test('dot logic and project sessions per account', () => {
  assert.equal(newestAt([{ at: 3 }, { at: 9 }]), 9);
  assert.equal(hasNewVisuals(10, 5), true);
  assert.equal(hasNewVisuals(5, 5), false);
  assert.equal(hasNewVisuals(0, 0), false);
  assert.equal(hasNewVisuals(5, undefined), true);
  const by = sessionsByAccount({ groups: [{ project: 'p', sessions: [
    { accountId: 'a', id: '1', projectDir: 'd', file: '1.jsonl', cwd: '/x' }, { accountId: 'b', id: '2', projectDir: 'd', file: '2.jsonl', cwd: '/x' }, { accountId: 'a', id: '3', projectDir: 'd', file: '3.jsonl', cwd: '/x' }] }] }, 'p');
  assert.deepEqual(by.map((x) => [x.accountId, x.project.sessions.length]), [['a', 2], ['b', 1]]);
});

// ---- router-file guard ----
test('router-file guard: files under a known folder are allowed, everything else is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-guard-'));
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(path.join(proj, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'proj-evil'));
  fs.writeFileSync(path.join(proj, 'sub', 'a.png'), 'x');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 's');
  fs.writeFileSync(path.join(dir, 'proj-evil', 'x.png'), 'x');
  const ok = guard.checkRequest(guard.fileUrl(path.join(proj, 'sub', 'a.png')), [proj]);
  assert.equal(ok.ok, true);
  assert.equal(ok.file, fs.realpathSync(path.join(proj, 'sub', 'a.png')));
  assert.equal(routerFileUrl(path.join(proj, 'sub', 'a.png')), guard.fileUrl(path.join(proj, 'sub', 'a.png')));
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(proj, 'sub', 'a.png')) + '?v=5', [proj]).ok, true);
  // outside, and a sibling that only shares the name prefix
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(dir, 'secret.txt')), [proj]).status, 403);
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(dir, 'proj-evil', 'x.png')), [proj]).status, 403);
  // dot-dot out of the folder
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(proj, '..', 'secret.txt')), [proj]).status, 403);
  // no known folders at all
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(proj, 'sub', 'a.png')), []).status, 403);
  // relative path, bad host, wrong scheme, bad encoding
  assert.equal(guard.checkRequest('router-file://local/' + encodeURIComponent('sub/a.png'), [proj]).status, 403);
  assert.equal(guard.checkRequest('router-file://evil/' + encodeURIComponent(path.join(proj, 'sub', 'a.png')), [proj]).status, 400);
  assert.equal(guard.checkRequest('file:///etc/passwd', [proj]).status, 400);
  assert.equal(guard.checkRequest('router-file://local/%E0%A4%A', [proj]).status, 400);
  // missing file inside the folder
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(proj, 'nope.png')), [proj]).status, 404);
});

test('router-file guard: a link that leaves the folder is refused', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-guard-link-'));
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(dir, 'secret.txt'), 's');
  try { fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(proj, 'link.png')); } catch (e) { return t.skip('cannot make symlinks here: ' + e.message); }
  assert.equal(guard.checkRequest(guard.fileUrl(path.join(proj, 'link.png')), [proj]).status, 403);
});

test('router-file guard: Windows paths compare without case and keep the separator boundary', () => {
  const real = (p) => p;
  const o = { platform: 'win32', realpath: real };
  assert.equal(guard.checkRequest(guard.fileUrl('C:\\Users\\aj\\Proj\\out\\a.png'), ['c:\\users\\aj\\proj'], o).ok, true);
  assert.equal(guard.checkRequest(guard.fileUrl('C:\\Users\\aj\\Proj-evil\\a.png'), ['C:\\Users\\aj\\Proj'], o).status, 403);
  assert.equal(guard.checkRequest(guard.fileUrl('C:\\Users\\aj\\Proj\\..\\secret.txt'), ['C:\\Users\\aj\\Proj'], o).status, 403);
  assert.equal(guard.checkRequest(guard.fileUrl('D:\\x.png'), ['C:\\Users\\aj\\Proj'], o).status, 403);
});

// ---- Markdown ----
test('markdown: raw HTML is escaped and unsafe links are neutralised', async (t) => {
  let marked;
  try { marked = await import('../desktop/node_modules/marked/lib/marked.esm.js'); } catch (e) { return t.skip('marked is not installed (run npm install in desktop)'); }
  const doc = renderMarkdownDoc(marked, '# Title\n\n<script>alert(1)</script>\n\nText <img src=x onerror=alert(2)> and [bad](javascript:alert(3)) and [ok](https://example.com) and ![pic](x.png)\n\n- one\n- two');
  assert.ok(doc.includes('<h1>Title</h1>'));
  assert.ok(doc.includes('<li>one</li>'));
  assert.ok(!doc.includes('<script>alert'));
  assert.ok(!/<img /i.test(doc.split('<body>')[1]));
  assert.ok(doc.includes('&lt;script&gt;'));
  assert.ok(!doc.includes('javascript:'));
  assert.ok(doc.includes('href="https://example.com"'));
  assert.equal(safeHref('JavaScript:x'), '#');
  assert.equal(safeHref('mailto:a@b.c'), 'mailto:a@b.c');
});

// ---- Show tool ----
test('show tool: handleShow appends {path, caption, cwd, at} and confirms', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-showfmt-'));
  const file = path.join(dir, 'nested', 'shows.jsonl');
  const now = () => new Date('2026-05-06T07:08:09.000Z');
  const text = show.handleShow({ path: 'out/a.png', caption: 'the chart' }, { file, cwd: '/w/proj', now });
  assert.match(text, /out\/a\.png/);
  show.handleShow({ path: '/abs/b.md' }, { file, cwd: '/w/proj', now });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { path: 'out/a.png', caption: 'the chart', cwd: '/w/proj', at: '2026-05-06T07:08:09.000Z' });
  assert.deepEqual(lines[1], { path: '/abs/b.md', caption: '', cwd: '/w/proj', at: '2026-05-06T07:08:09.000Z' });
  assert.throws(() => show.handleShow({}, { file }), /needs a path/);
  assert.throws(() => show.handleShow({ path: 'a.png', caption: 3 }, { file }), /caption/);
});

test('show tool: file location comes from ROUTER_SHOWS_FILE, then APPDATA, then ~/.config', () => {
  assert.equal(show.showsFilePath({ ROUTER_SHOWS_FILE: '/x/s.jsonl', APPDATA: '/a' }, '/h'), '/x/s.jsonl');
  assert.equal(show.showsFilePath({ APPDATA: path.join('/a', 'Roaming') }, '/h'), path.join('/a', 'Roaming', 'Project Router', 'shows.jsonl'));
  assert.equal(show.showsFilePath({}, '/h'), path.join('/h', '.config', 'Project Router', 'shows.jsonl'));
});

test('show tool: the server over stdio lists show and writes the line (SDK client)', async (t) => {
  let Client, StdioClientTransport;
  try {
    // Resolve from desktop/ so the package's exports map applies, as it does for the app.
    const desktopRequire = createRequire(new URL('../desktop/package.json', import.meta.url));
    ({ Client } = desktopRequire('@modelcontextprotocol/sdk/client/index.js'));
    ({ StdioClientTransport } = desktopRequire('@modelcontextprotocol/sdk/client/stdio.js'));
  } catch (e) { return t.skip('@modelcontextprotocol/sdk is not installed (run npm install in desktop)'); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-showrun-'));
  const file = path.join(dir, 'shows.jsonl');
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.resolve('desktop/showtool/server.cjs')], cwd: dir,
    env: { ...process.env, ROUTER_SHOWS_FILE: file },
  });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map((x) => x.name), ['show']);
    assert.deepEqual(tools[0].inputSchema.required, ['path']);
    const r = await client.callTool({ name: 'show', arguments: { path: 'pic.png', caption: 'hi' } });
    assert.ok(!r.isError);
    assert.match(r.content[0].text, /pic\.png/);
    const bad = await client.callTool({ name: 'show', arguments: {} });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
  const o = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assert.equal(o.path, 'pic.png');
  assert.equal(o.caption, 'hi');
  assert.equal(fs.realpathSync(o.cwd), fs.realpathSync(dir));
  assert.ok(!Number.isNaN(Date.parse(o.at)));
});

test('Show tool command lines (user scope, ELECTRON_RUN_AS_NODE, the account folder)', () => {
  const { showToolCommand } = require('../desktop/visuals.js');
  const on = showToolCommand(true, '/h/.claude-work', '/app/Project Router.exe', '/app/resources/app.asar/showtool/server.cjs');
  assert.deepEqual(on.args, ['mcp', 'add', '--scope', 'user', 'router-show', '-e', 'ELECTRON_RUN_AS_NODE=1', '--', '/app/Project Router.exe', '/app/resources/app.asar/showtool/server.cjs']);
  assert.equal(on.env.CLAUDE_CONFIG_DIR, '/h/.claude-work');
  assert.deepEqual(showToolCommand(false, '/h/.claude', 'x', 'y').args, ['mcp', 'remove', '--scope', 'user', 'router-show']);
});
