// The app's own local page: scan the pairing QR code once, remember the PC's address, then open it.
const KEY = 'edens.base';
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of ['scan', 'lost', 'wait']) $(s).hidden = s !== id; };
let stream = null;
let scanning = false;

// Navigation is one function so a test can replace it (a page cannot be asked to leave in a test).
window.edensGo = window.edensGo || ((url) => { location.href = url; });

// "192.168.1.20:47213" or a full pair URL -> { base, pairUrl|null }. null when it is not an address.
function parseAddress(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : 'http://' + t);
    if (!u.hostname) return null;
    return { base: u.origin, pairUrl: u.pathname === '/pair' && u.hash.length > 1 ? u.href : null };
  } catch { return null; }
}

// The PC's pages get the app's origin so they can offer a way back to the scan screen.
function toPc(href) {
  const u = new URL(href);
  u.searchParams.set('app', location.origin); // the query goes before the hash, so the one-time code stays in the hash
  return u.href;
}

function connect(a) {
  localStorage.setItem(KEY, a.base); // the base address only, never the one-time code
  stop();
  window.edensGo(toPc(a.pairUrl || a.base + '/'));
}

function stop() {
  scanning = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function startScan() {
  show('scan');
  $('msg').textContent = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    $('msg').textContent = 'The camera is not available (' + (e.name || 'error') + '). Type the address below instead.';
    return;
  }
  const v = $('cam');
  v.srcObject = stream;
  await v.play();
  scanning = true;
  const c = $('frame'), g = c.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!scanning) return;
    if (v.videoWidth) {
      c.width = v.videoWidth; c.height = v.videoHeight;
      g.drawImage(v, 0, 0);
      const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (r) {
        const a = parseAddress(r.data);
        if (a && a.pairUrl) return connect(a);
        $('msg').textContent = 'That QR code is not from Edens Router.';
      }
    }
    setTimeout(tick, 150);
  };
  tick();
}

async function reachable(base) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try { await fetch(base + '/', { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' }); return true; }
  catch { return false; } finally { clearTimeout(timer); }
}

async function open() {
  const base = localStorage.getItem(KEY);
  if (!base) return startScan();
  show('wait');
  if (await reachable(base)) window.edensGo(toPc(base + '/'));
  else show('lost');
}

$('cancel').onclick = () => { stop(); if (localStorage.getItem(KEY)) open(); else $('msg').textContent = 'Nothing paired yet. Scan the code or type the address.'; };
$('go').onclick = () => { const a = parseAddress($('addr').value); if (a) connect(a); else $('msg').textContent = 'That is not an address. Try 192.168.1.20:47213.'; };
$('retry').onclick = open;
$('rescan').onclick = startScan;
// The PC sent us back because this phone is not paired: forget the address and scan again.
if (new URLSearchParams(location.search).get('rescan') === '1') {
  localStorage.removeItem(KEY);
  history.replaceState(null, '', location.pathname);
  startScan();
} else open();
