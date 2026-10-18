'use strict';
// Copies the terminal widget files into site/vendor/xterm/ and the grid library into site/vendor/dockview/
// (both git-ignored; the site loads them from there).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const vendor = path.join(root, '..', 'site', 'vendor');
const sets = [
  ['xterm', [
    ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
    ['@xterm/xterm/css/xterm.css', 'xterm.css'],
    ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ]],
  // dockview-core 8.4.1 has no separate CSS file: its browser build adds its own style element when it loads.
  ['dockview', [
    ['dockview-core/dist/dockview-core.js', 'dockview-core.js'],
  ]],
];
for (const [name, files] of sets) {
  const out = path.join(vendor, name);
  fs.mkdirSync(out, { recursive: true });
  for (const [from, to] of files) {
    const src = path.join(root, 'node_modules', from);
    if (!fs.existsSync(src)) { console.error('copy-vendor: missing ' + src + ' (run npm install in desktop)'); process.exit(1); }
    fs.copyFileSync(src, path.join(out, to));
  }
  console.log('copy-vendor: copied ' + files.length + ' files to ' + out);
}
