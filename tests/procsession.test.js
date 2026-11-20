import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readProcessSession } = require('../desktop/procsession.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'procsession-'));
fs.mkdirSync(path.join(dir, 'sessions'));
const put = (pid, body) => fs.writeFileSync(path.join(dir, 'sessions', pid + '.json'), typeof body === 'string' ? body : JSON.stringify(body));
const ID = '33333333-3333-4333-8333-123456789abc';

test('a valid file gives only sessionId and status', () => {
  put(10, { sessionId: ID, status: 'idle', cwd: 'C:/x', secret: 'no' });
  assert.deepEqual(readProcessSession(dir, 10), { sessionId: ID, status: 'idle' });
});
test('missing, broken and wrong-typed files give null', () => {
  assert.equal(readProcessSession(dir, 11), null);
  put(12, '{not json');
  assert.equal(readProcessSession(dir, 12), null);
  put(13, { sessionId: 5, status: 'idle' });
  assert.equal(readProcessSession(dir, 13), null);
  put(14, ['x']);
  assert.equal(readProcessSession(dir, 14), null);
  assert.equal(readProcessSession(dir, '10'), null);
  assert.equal(readProcessSession('', 10), null);
});
test('an odd session id gives null; a missing status is empty', () => {
  put(15, { sessionId: '../../etc/passwd', status: 'idle' });
  assert.equal(readProcessSession(dir, 15), null);
  put(16, { sessionId: ID });
  assert.deepEqual(readProcessSession(dir, 16), { sessionId: ID, status: '' });
});
