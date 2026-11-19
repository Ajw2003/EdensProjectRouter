'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const names = ['listAccounts', 'addAccount', 'grantPermission', 'listSessionFiles', 'readSessionText', 'readStatus',
  'reporterState', 'setReporter', 'resume', 'newSession', 'claudeRunning',
  'readTranscript', 'ptyOpen', 'ptyWrite', 'ptyResize', 'ptyClose', 'ptyList',
  'layoutGet', 'layoutSet', 'ptyBuffer', 'windowList', 'newWindow', 'moveTile', 'gridReady',
  'copySessionTo', 'createAccount', 'screenWaiting', 'screenRead', 'ptyScreen', 'notify'];
// Visuals (separate block): the Visuals tile and the Show tool.
const visualsNames = ['listVisuals', 'openVisualFile', 'readVisualText', 'showVisualInFolder', 'showToolState', 'setShowTool'];
// Send to (issue #21): hand-off files, the summary run, the git exclude line, sub-session links, tiles in all windows.
const handoffNames = ['handoffWrite', 'handoffCopyFile', 'handoffList', 'handoffSummary', 'handoffAsk', 'gitExcludeGet', 'gitExcludeSet',
  'handoffLinks', 'handoffLinkAdd', 'handoffTiles', 'handoffRelay'];
// Phone link (issue #37): the PC's own switch, QR pairing and unpair. Not callable from a phone.
const phoneNames = ['phoneLinkState', 'phoneLinkSet', 'phonePair', 'phoneUnpair'];
const api = {};
for (const n of names.concat(visualsNames, handoffNames, phoneNames)) api[n] = (...args) => ipcRenderer.invoke('router:' + n, ...args);
// Events from main: the callback gets only the payload, never the raw IPC event.
function on(channel, cb) {
  if (typeof cb !== 'function') throw new Error('A callback is needed.');
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
// The Visual view's Attach: a picked file's absolute path (File.path is gone in current Electron).
api.pathForFile = (f) => webUtils.getPathForFile(f);
api.onPtyData = (cb) => on('router:ptyData', cb);
api.onPtyExit = (cb) => on('router:ptyExit', cb);
api.onTileIn = (cb) => on('router:tileIn', cb);
api.onNotifyClick = (cb) => on('router:notifyClick', cb);
api.onHandoffDeliver = (cb) => on('router:handoffDeliver', cb);
contextBridge.exposeInMainWorld('routerDesktop', api);
