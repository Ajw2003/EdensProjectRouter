'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const names = ['listAccounts', 'addAccount', 'grantPermission', 'listSessionFiles', 'readSessionText', 'readStatus',
  'reporterState', 'setReporter', 'resume', 'newSession', 'claudeRunning'];
const api = {};
for (const n of names) api[n] = (...args) => ipcRenderer.invoke('router:' + n, ...args);
contextBridge.exposeInMainWorld('routerDesktop', api);
