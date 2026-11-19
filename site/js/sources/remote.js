// Phone side of the phone link (issue #37): a window.routerDesktop stand-in with the same method names.
// A plain script (not a module) so it runs before the app's main module. Each call is POST /api/<name> with the arguments as JSON;
// events come from the Server-Sent Events stream at /events. Methods the PC refuses fail with the PC's message.
(function () {
  var names = ['listAccounts', 'addAccount', 'grantPermission', 'listSessionFiles', 'readSessionText', 'readStatus', 'reporterState',
    'setReporter', 'claudeRunning', 'readTranscript', 'ptyOpen', 'ptyWrite', 'ptyResize', 'ptyClose', 'ptyList', 'layoutGet', 'layoutSet',
    'ptyBuffer', 'copySessionTo', 'screenWaiting', 'screenRead', 'ptyScreen', 'listVisuals', 'readVisualText', 'showToolState', 'setShowTool',
    'handoffWrite', 'handoffCopyFile', 'handoffList', 'handoffSummary', 'handoffAsk', 'gitExcludeGet', 'gitExcludeSet', 'handoffLinks',
    'handoffLinkAdd', 'listCloudSessions', 'listDesktopOwners',
    // Refused by the PC for a phone; they still exist so a screen that calls one gets a plain message, not a crash.
    'resume', 'newSession', 'createAccount', 'openVisualFile', 'showVisualInFolder', 'newWindow', 'moveTile', 'windowList', 'gridReady',
    'handoffTiles', 'handoffRelay'];
  var api = { isRemote: true };
  names.forEach(function (n) {
    api[n] = function () {
      var args = Array.prototype.slice.call(arguments);
      return fetch('/api/' + n, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args), credentials: 'same-origin' })
        .then(function (r) {
          if (r.status === 401) throw new Error('This phone is not paired any more. Scan a new code on the PC.');
          return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j.result; });
        });
    };
  });
  // The PC shows its own desktop notifications; the phone does not ask it to show more.
  api.notify = function () { return Promise.resolve(true); };
  // "Open on claude.ai" opens in the phone's own browser, not on the PC.
  api.openExternal = function (url) { window.open(url, '_blank', 'noopener'); return Promise.resolve(true); };
  var listeners = { ptyData: [], ptyExit: [], notify: [] };
  var es = new EventSource('/events');
  Object.keys(listeners).forEach(function (ev) {
    es.addEventListener(ev, function (m) { var p = JSON.parse(m.data); listeners[ev].slice().forEach(function (cb) { cb(p); }); });
  });
  function on(ev, cb) {
    if (typeof cb !== 'function') throw new Error('A callback is needed.');
    listeners[ev].push(cb);
    return function () { listeners[ev] = listeners[ev].filter(function (x) { return x !== cb; }); };
  }
  api.onPtyData = function (cb) { return on('ptyData', cb); };
  api.onPtyExit = function (cb) { return on('ptyExit', cb); };
  // A PC notification shows here too when the browser allows it; a tap hands the key to the screens, like a click on the PC.
  api.onNotifyClick = function (cb) {
    return on('notify', function (p) {
      if (!window.Notification || Notification.permission !== 'granted') return;
      var n = new Notification('Project Router', { body: p.text });
      n.onclick = function () { cb(p.key); };
    });
  };
  api.onTileIn = function () { return function () {}; }; // tiles do not move between windows on a phone
  api.onHandoffDeliver = function () { return function () {}; };
  api.pathForFile = function () { return ''; };
  window.routerDesktop = api;
})();
