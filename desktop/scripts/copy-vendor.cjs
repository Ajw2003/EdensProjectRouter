'use strict';
// Copies the terminal widget files into site/vendor/xterm/ (git-ignored; the site loads them from there).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, '..', 'site', 'vendor', 'xterm');
const files = [
  ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
];
fs.mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  const src = path.join(root, 'node_modules', from);
  if (!fs.existsSync(src)) { console.error('copy-vendor: missing ' + src + ' (run npm install in desktop)'); process.exit(1); }
  fs.copyFileSync(src, path.join(out, to));
}
console.log('copy-vendor: copied ' + files.length + ' files to ' + out);
