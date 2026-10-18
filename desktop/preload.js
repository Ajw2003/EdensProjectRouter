'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const names = ['listAccounts', 'addAccount', 'grantPermission', 'listSessionFiles', 'readSessionText', 'readStatus',
  'reporterState', 'setReporter', 'resume', 'newSession', 'claudeRunning',
  'readTranscript', 'ptyOpen', 'ptyWrite', 'ptyResize', 'ptyClose', 'ptyList',
  'layoutGet', 'layoutSet', 'ptyBuffer', 'windowList', 'newWindow', 'moveTile', 'gridReady'];
const api = {};
for (const n of names) api[n] = (...args) => ipcRenderer.invoke('router:' + n, ...args);
// Events from main: the callback gets only the payload, never the raw IPC event.
function on(channel, cb) {
  if (typeof cb !== 'function') throw new Error('A callback is needed.');
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
api.onPtyData = (cb) => on('router:ptyData', cb);
api.onPtyExit = (cb) => on('router:ptyExit', cb);
api.onTileIn = (cb) => on('router:tileIn', cb);
contextBridge.exposeInMainWorld('routerDesktop', api);
