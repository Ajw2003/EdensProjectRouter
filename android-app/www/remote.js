// Injected by MainActivity into the PC's page (the WebView leaves the local page for http://<pc>:47213/).
// Adds: a bottom key row for the terminal, and a phone notification when a session joins Needs you.
(function () {
  if (window.__edensRemote) return;
  window.__edensRemote = true;

  // The Server-Sent Events name step 7's server sends when a session joins Needs you. Change it here only.
  const NEEDS_YOU_EVENT = 'notify';

  const cap = window.Capacitor;
  const native = (plugin, method, opts) => (cap && cap.nativePromise ? cap.nativePromise(plugin, method, opts || {}) : Promise.reject(new Error('no Capacitor bridge')));
  const fail = (what) => (e) => console.error('Edens Router app: ' + what + ':', e);

  // ---- which pty is the visible terminal? Remember the one the page last wrote to or opened. ----
  let ptyId = null;
  function hookBridge() {
    const d = window.routerDesktop;
    if (!d || d.__edensHooked) return !!d;
    d.__edensHooked = true;
    const write = d.ptyWrite && d.ptyWrite.bind(d);
    if (write) d.ptyWrite = (id, data) => { ptyId = id; return write(id, data); };
    const open = d.ptyOpen && d.ptyOpen.bind(d);
    if (open) d.ptyOpen = (...a) => open(...a).then((r) => { if (r && r.ptyId) ptyId = r.ptyId; return r; });
    const click = d.onNotifyClick && d.onNotifyClick.bind(d);
    if (click) d.onNotifyClick = (cb) => { openNeeds = cb; return click(cb); }; // the page's "open that session" handler
    return true;
  }
  let openNeeds = null;

  // ---- key row ----
  const KEYS = [['Esc', '\x1b'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['Enter', '\r']];
  let row = null;
  function terminalVisible() {
    return [...document.querySelectorAll('.xterm')].some((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 40);
  }
  function makeRow() {
    row = document.createElement('div');
    row.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;display:none;gap:8px;padding:8px;background:#1d2026;border-top:1px solid #444';
    for (const [label, seq] of KEYS) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'flex:1;font:18px system-ui;padding:14px 0;border:0;border-radius:10px;background:#2a2e36;color:#fff';
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keyboard and terminal focus
      b.addEventListener('click', () => {
        const d = window.routerDesktop;
        if (d && d.ptyWrite && ptyId) d.ptyWrite(ptyId, seq).catch(fail('key send'));
      });
      row.appendChild(b);
    }
    document.body.appendChild(row);
  }
  setInterval(() => {
    hookBridge();
    if (!row && document.body) makeRow();
    if (row) row.style.display = terminalVisible() ? 'flex' : 'none';
  }, 700);

  // ---- notifications ----
  let permission = null;
  function askPermissionOnce() {
    if (permission) return permission;
    permission = native('LocalNotifications', 'checkPermissions').then((p) => {
      if (p.display === 'granted' || localStorage.getItem('edens.asked')) return p;
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#000a;display:flex;align-items:center;padding:24px';
        box.innerHTML = '<div style="background:#1d2026;color:#fff;font:18px/1.4 system-ui;padding:20px;border-radius:14px;width:100%"><p style="margin:0 0 16px">Allow notifications so your phone can tell you when a session needs you.</p><button style="font:inherit;padding:14px;width:100%;border:0;border-radius:10px;background:#2f6fed;color:#fff">OK</button></div>';
        box.querySelector('button').onclick = () => {
          box.remove();
          localStorage.setItem('edens.asked', '1');
          native('LocalNotifications', 'requestPermissions').then(resolve, () => resolve({ display: 'denied' }));
        };
        document.body.appendChild(box);
      });
    });
    return permission;
  }

  async function notify(text, key) {
    const p = await askPermissionOnce();
    if (p.display !== 'granted') return;
    await native('LocalNotifications', 'schedule', {
      notifications: [{ id: (Date.now() % 2147483647), title: 'Edens Router', body: text, extra: { key } }],
    });
  }

  // Listen on every EventSource the page opens (the stand-in's own stream), whatever it is called.
  const RealES = window.EventSource;
  if (RealES) {
    window.EventSource = function (...a) {
      const es = new RealES(...a);
      es.addEventListener(NEEDS_YOU_EVENT, (ev) => {
        let m = {};
        try { m = JSON.parse(ev.data); } catch { m = { text: String(ev.data) }; }
        notify(m.text || m.body || 'A session needs you', m.key || m.session || m.id).catch(fail('notification'));
      });
      return es;
    };
    window.EventSource.prototype = RealES.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSED']) window.EventSource[k] = RealES[k];
  }

  // Tapping a notification brings the app forward; open that session.
  if (cap && cap.addListener) {
    cap.addListener('LocalNotifications', 'localNotificationActionPerformed', (a) => {
      const key = a && a.notification && a.notification.extra && a.notification.extra.key;
      if (key && openNeeds) openNeeds(key);
    });
  }
  askPermissionOnce().catch(fail('permission'));
})();
