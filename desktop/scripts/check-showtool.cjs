'use strict';
// Starts the Show tool as a child process, calls `show` once through the SDK client and checks the line was written.
// Usage: check-showtool.cjs [command] [server.cjs]   (defaults: this node, ../showtool/server.cjs)
// The child gets ELECTRON_RUN_AS_NODE=1, so passing Electron's exe as the command runs the server under Electron's Node.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  // Resolved here because the child runs in a temp folder, where relative paths would not resolve.
  const command = process.argv[2] ? path.resolve(process.argv[2]) : process.execPath;
  const server = path.resolve(process.argv[3] || path.join(__dirname, '..', 'showtool', 'server.cjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-show-'));
  const file = path.join(dir, 'shows.jsonl');
  const transport = new StdioClientTransport({
    command, args: [server], cwd: dir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ROUTER_SHOWS_FILE: file },
  });
  const client = new Client({ name: 'check-showtool', version: '1.0.0' });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    if (!tools.tools.some((t) => t.name === 'show')) throw new Error('the server does not offer a show tool');
    const r = await client.callTool({ name: 'show', arguments: { path: 'picture.png', caption: 'check' } });
    if (r.isError) throw new Error('show returned an error: ' + JSON.stringify(r.content));
  } finally {
    await client.close();
  }
  if (!fs.existsSync(file)) throw new Error('no shows.jsonl was written at ' + file);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const o = JSON.parse(lines[lines.length - 1]);
  if (o.path !== 'picture.png' || o.caption !== 'check' || !o.cwd || Number.isNaN(Date.parse(o.at))) {
    throw new Error('the line was not as expected: ' + lines[lines.length - 1]);
  }
  console.log('check-showtool: ok, line written: ' + lines[lines.length - 1]);
}

main().catch((e) => { console.error('check-showtool: FAILED', e); process.exit(1); });
