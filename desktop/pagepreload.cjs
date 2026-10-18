'use strict';
// Preload for the page webviews (partition "router-pages"). The page itself gets no Node access.
// For now it only tells the host tile what the page copies; the "Send to" feature builds on this.
const { ipcRenderer } = require('electron');

function report(text) {
  if (typeof text !== 'string' || !text) return;
  try { ipcRenderer.sendToHost('copied', text.slice(0, 200000)); } catch (e) { console.error('router: could not report the copied text:', e); }
}

document.addEventListener('copy', () => {
  const sel = window.getSelection();
  report(sel ? sel.toString() : '');
}, true);
