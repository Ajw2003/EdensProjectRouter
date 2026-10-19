'use strict';
// The Show tool: a small MCP server over stdio. Claude calls show({path, caption?}) to put a file on screen; each call appends
// one JSON line {path, caption, cwd, at} to shows.jsonl, which Project Router reads for the project's Visuals tile.
// Run it with plain node, or with Electron under ELECTRON_RUN_AS_NODE=1.
const fs = require('fs');
const os = require('os');
const path = require('path');

// ROUTER_SHOWS_FILE when set, else <APPDATA or ~/.config>/Project Router/shows.jsonl (the app's own data folder).
function showsFilePath(env, home) {
  const e = env || process.env;
  if (e.ROUTER_SHOWS_FILE) return e.ROUTER_SHOWS_FILE;
  const base = e.APPDATA || path.join(home || os.homedir(), '.config');
  return path.join(base, 'Project Router', 'shows.jsonl');
}

// Appends the line and returns the confirmation text. Throws (so Claude is told) when the arguments or the write are bad.
function handleShow(args, opts) {
  const o = opts || {};
  const a = args && typeof args === 'object' ? args : {};
  if (typeof a.path !== 'string' || !a.path.trim()) throw new Error('show needs a path (a string).');
  if (a.caption !== undefined && typeof a.caption !== 'string') throw new Error('caption must be a string.');
  const line = { path: a.path, caption: a.caption || '', cwd: o.cwd || process.cwd(), at: (o.now ? o.now() : new Date()).toISOString() };
  const file = o.file || showsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
  return 'Shown in Project Router: ' + a.path;
}

const TOOL = {
  name: 'show',
  description: 'Put a file (picture, video, PDF, Markdown or web page) on screen in Project Router, in this project\'s Visuals tile.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File to show. A relative path is taken from the current folder.' },
      caption: { type: 'string', description: 'A short note about it (optional).' },
    },
    required: ['path'],
  },
};

async function main() {
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  const server = new Server({ name: 'router-show', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== 'show') return { isError: true, content: [{ type: 'text', text: 'Unknown tool ' + req.params.name }] };
    try {
      return { content: [{ type: 'text', text: handleShow(req.params.arguments) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: String((e && e.message) || e) }] };
    }
  });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((e) => { console.error('router-show failed to start:', e); process.exit(1); });
}

module.exports = { handleShow, showsFilePath, TOOL };
