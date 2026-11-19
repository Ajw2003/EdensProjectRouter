'use strict';
// Saves a PNG of the Project Router window through Electron's remote-debugging port, so a check can look at the real window
// without screen control. Only that window is captured, never the screen. Start the app with --remote-debugging-port=<port>
// (it listens on 127.0.0.1 only), then: node capture-window.cjs <port> <out.png>. Needs Node 22 (global WebSocket and fetch).
const fs = require('fs');

async function main() {
  const [port, out] = process.argv.slice(2);
  if (!/^\d+$/.test(port || '') || !out) throw new Error('usage: node capture-window.cjs <port> <out.png>');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no window found on port ' + port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not open the debugging connection')); });
  const png = await new Promise((resolve, reject) => {
    ws.onmessage = (m) => {
      const j = JSON.parse(m.data);
      if (j.id !== 1) return;
      if (j.error) reject(new Error(j.error.message)); else resolve(j.result.data);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  fs.writeFileSync(out, Buffer.from(png, 'base64'));
  ws.close();
  console.log('saved ' + out + ' (' + page.title + ')');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
