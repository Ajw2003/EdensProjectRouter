'use strict';
// Preload for the page webviews (partition "router-pages"). The page itself gets no Node access.
// It tells the host tile what the page copies (clipboard.writeText and copy events) so the tile can offer "Send to <session>".
const { ipcRenderer, webFrame } = require('electron');

function report(text) {
  if (typeof text !== 'string' || !text.trim()) return;
  try { ipcRenderer.sendToHost('router:copied', text.slice(0, 200000)); } catch (e) { console.error('router: could not report the copied text:', e); }
}

document.addEventListener('copy', () => {
  const sel = window.getSelection();
  report(sel ? sel.toString() : '');
}, true);

// The page's own scripts run in the main world, so writeText is wrapped there (the original is still called and its result
// returned). The wrapper only fires a DOM event carrying the text; this preload listens and reports it. Nothing else crosses.
const EVENT = 'router-copied-' + Math.random().toString(36).slice(2);
document.addEventListener(EVENT, (ev) => report(typeof ev.detail === 'string' ? ev.detail : ''), true);
try {
  webFrame.executeJavaScript('(' + function (name) {
    var clip = navigator.clipboard;
    var orig = clip && clip.writeText;
    if (typeof orig !== 'function') return;
    clip.writeText = function (text) {
      try { document.dispatchEvent(new CustomEvent(name, { detail: String(text) })); } catch (e) { /* the copy still happens */ }
      return orig.apply(this, arguments);
    };
  } + ')(' + JSON.stringify(EVENT) + ')').catch((e) => console.error('router: could not watch clipboard.writeText:', e));
} catch (e) { console.error('router: could not watch clipboard.writeText:', e); }
