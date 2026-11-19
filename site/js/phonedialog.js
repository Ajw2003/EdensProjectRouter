// "Pair a phone": one QR per address (the one-time code is inside it), the paired phones with Unpair. DOM built with textContent only.
import { dialogShell } from './menu.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const why = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

export function openPhoneDialog(source) {
  let timer = null;
  const done = dialogShell('Pair a phone', (form, close) => {
    form.appendChild(el('p', '', 'On the phone, scan the code that matches how it is connected. The code works once and runs out in five minutes.'));
    const codes = el('div', 'phone-codes');
    form.appendChild(codes);
    form.appendChild(el('p', 'phone-warn', 'On home Wi-Fi the link is plain HTTP: someone on that network could watch the traffic, but cannot use it without a key. Tailscale encrypts it.'));
    form.appendChild(el('h3', '', 'Paired phones'));
    const list = el('ul', 'phone-devices');
    form.appendChild(list);
    const err = el('p', 'grid-error');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    const row = el('div', 'grid-dialog-actions');
    const ok = el('button', 'btn primary', 'Done');
    ok.type = 'button';
    ok.addEventListener('click', () => close(true));
    row.appendChild(ok);
    form.appendChild(row);

    const drawDevices = (devices) => {
      list.textContent = '';
      if (!devices.length) list.appendChild(el('li', 'phone-none', 'No phone is paired yet.'));
      for (const d of devices) {
        const li = el('li', 'phone-device');
        li.appendChild(el('span', '', d.name + ' · paired ' + String(d.pairedAt).slice(0, 10)));
        const b = el('button', 'btn small', 'Unpair');
        b.type = 'button';
        b.setAttribute('aria-label', 'Unpair ' + d.name);
        b.addEventListener('click', async () => {
          try { await source.phoneUnpair(d.id); err.textContent = ''; } catch (e) { err.textContent = 'Could not unpair: ' + why(e); }
          poll();
        });
        li.appendChild(b);
        list.appendChild(li);
      }
    };
    const poll = async () => {
      try { drawDevices((await source.phoneLinkState()).devices); } catch (e) { err.textContent = 'Could not read the paired phones: ' + why(e); }
    };
    (async () => {
      try {
        const r = await source.phonePair();
        for (const l of r.links) {
          const box = el('figure', 'phone-code');
          const img = el('img', 'phone-qr');
          img.alt = 'QR code for ' + l.label;
          img.width = 180;
          img.height = 180;
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(l.svg);
          box.append(img, el('figcaption', '', l.label), el('code', 'phone-url', l.url));
          codes.appendChild(box);
        }
      } catch (e) { err.textContent = why(e); }
    })();
    poll();
    timer = setInterval(poll, 2000);
    return ok;
  });
  return done.finally(() => clearInterval(timer));
}
