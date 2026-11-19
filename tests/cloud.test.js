import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCloudReader } = require('../desktop/cloud.js');

const TOKEN = 'sk-test-SECRET-token-123';
const NOW = 1_800_000_000_000;

function account(expiresAt = NOW + 3600_000, withCreds = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-'));
  if (withCreds) fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt } }));
  return dir;
}
async function server(handler) {
  const reqs = [];
  const srv = http.createServer((req, res) => { reqs.push(req); handler(req, res); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { reqs, base: 'http://127.0.0.1:' + srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
const json = (code, body) => (req, res) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const entry = (o) => ({ id: 'cse_1', title: 'T', status: 'active', worker_status: 'running', created_at: '2026-01-01T00:00:00Z', last_event_at: '2026-01-02T00:00:00Z', config: { sources: [] }, ...o });

test('good answer maps sessions; token only in Authorization header', async () => {
  const s = await server(json(200, { data: [entry({ config: { sources: [{ type: 'git_repository', url: 'https://github.com/own/proj.git' }] } }), entry({ id: 'cse_2', title: '', worker_status: undefined })] }));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account());
  await s.close();
  assert.equal(r.state, 'ok');
  assert.equal(r.sessions.length, 2);
  assert.deepEqual(r.sessions[0], { id: 'cse_1', title: 'T', status: 'running', repo: 'own/proj', repoName: 'proj', createdAt: '2026-01-01T00:00:00Z', lastActiveMs: Date.parse('2026-01-02T00:00:00Z'), url: 'https://claude.ai/code/cse_1' });
  assert.equal(r.sessions[1].title, 'Untitled cloud session');
  assert.equal(r.sessions[1].status, 'active');
  const q = s.reqs[0];
  assert.equal(q.url, '/v1/code/sessions');
  assert.equal(q.headers.authorization, 'Bearer ' + TOKEN);
  assert.equal(q.headers['anthropic-version'], '2023-06-01');
  assert.equal(q.headers['content-type'], 'application/json');
  assert.ok(!q.url.includes(TOKEN));
  assert.ok(!Object.entries(q.headers).some(([k, v]) => k !== 'authorization' && String(v).includes(TOKEN)));
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('archived sessions are dropped', async () => {
  const s = await server(json(200, { data: [entry({ id: 'a', status: 'archived' }), entry({ id: 'b' })] }));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account());
  await s.close();
  assert.deepEqual(r.sessions.map((x) => x.id), ['b']);
});

test('repo parsing: https, git@, none', async () => {
  const src = (url) => ({ sources: [{ type: 'git_repository', url }] });
  const s = await server(json(200, { data: [
    entry({ id: '1', config: src('https://github.com/a/b') }),
    entry({ id: '2', config: src('git@github.com:c/d.git') }),
    entry({ id: '3', config: { sources: [] } }),
  ] }));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account());
  await s.close();
  assert.deepEqual(r.sessions.map((x) => [x.repo, x.repoName]), [['a/b', 'b'], ['c/d', 'd'], ['', '']]);
});

test('expired by expiresAt: no request made', async () => {
  const s = await server(json(200, { data: [] }));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account(NOW - 1));
  await s.close();
  assert.equal(r.state, 'expired');
  assert.equal(s.reqs.length, 0);
});

test('401 -> expired', async () => {
  const s = await server(json(401, {}));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account());
  await s.close();
  assert.equal(r.state, 'expired');
});

test('500 -> error with plain message', async () => {
  const s = await server(json(500, {}));
  const r = await createCloudReader({ base: s.base, now: () => NOW }).readAccount(account());
  await s.close();
  assert.equal(r.state, 'error');
  assert.equal(r.message, 'The server answered 500.');
});

test('connection refused -> error', async () => {
  const s = await server(json(200, {}));
  const base = s.base;
  await s.close();
  const r = await createCloudReader({ base, now: () => NOW }).readAccount(account());
  assert.equal(r.state, 'error');
  assert.ok(r.message && !r.message.includes(TOKEN));
});

test('missing credentials -> no-sign-in', async () => {
  const r = await createCloudReader({ now: () => NOW }).readAccount(account(0, false));
  assert.equal(r.state, 'no-sign-in');
});

test('reader writes nothing into the account folder', async () => {
  const s = await server(json(200, { data: [] }));
  const dir = account();
  await createCloudReader({ base: s.base, now: () => NOW }).readAccount(dir);
  await s.close();
  assert.deepEqual(fs.readdirSync(dir), ['.credentials.json']);
});
