'use strict';
// Run under Electron's Node (ELECTRON_RUN_AS_NODE=1). Spawns an echo through node-pty; exits non-zero unless router-ok shows within 20 s.
const pty = require('node-pty');
const win = process.platform === 'win32';
const term = pty.spawn(win ? 'cmd.exe' : 'sh', win ? ['/c', 'echo router-ok'] : ['-c', 'echo router-ok'], { name: 'xterm-256color', cols: 80, rows: 24 });
let out = '';
const timer = setTimeout(() => { console.error('check-pty: no router-ok within 20 s. Output: ' + JSON.stringify(out)); process.exit(1); }, 20000);
term.onData((d) => { out += d; if (out.includes('router-ok')) { clearTimeout(timer); console.log('check-pty: ok (' + process.platform + ')'); process.exit(0); } });
term.onExit(() => { if (!out.includes('router-ok')) { clearTimeout(timer); console.error('check-pty: exited without router-ok. Output: ' + JSON.stringify(out)); process.exit(1); } });
