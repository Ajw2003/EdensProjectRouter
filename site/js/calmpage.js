// The What to show page: three presets, one switch per kind of information, and Reduce motion. Changes apply and save at once.
import { dialogShell } from './menu.js';
import { KINDS, PRESET_LABELS, PRESETS, presetOf, setPreset, setSwitch } from './calm.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// calm = { get(), set(settings) }
export function openCalmPage(calm) {
  return dialogShell('What to show', (form, done) => {
    const body = el('div', 'calm-page');
    const draw = () => {
      const s = calm.get();
      body.textContent = '';
      const cur = presetOf(s);
      const presets = el('div', 'calm-presets');
      presets.setAttribute('role', 'group');
      presets.setAttribute('aria-label', 'Preset');
      for (const n of Object.keys(PRESETS)) {
        const b = el('button', 'btn' + (cur === n ? ' primary' : ''), PRESET_LABELS[n]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(cur === n));
        b.addEventListener('click', () => { calm.set(setPreset(calm.get(), n)); draw(); });
        presets.appendChild(b);
      }
      body.append(presets, el('p', 'calm-note', cur === 'custom' ? 'Custom: you changed a switch.' : 'Calm is the default.'));
      for (const [k, label] of KINDS) {
        const row = el('label', 'calm-row');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = s.switches[k];
        cb.dataset.kind = k;
        cb.addEventListener('change', () => { calm.set(setSwitch(calm.get(), k, cb.checked)); draw(); });
        row.append(cb, el('span', '', label));
        body.appendChild(row);
      }
      const mo = el('label', 'calm-row');
      const mc = el('input');
      mc.type = 'checkbox';
      mc.checked = s.reduceMotion;
      mc.dataset.kind = 'reduceMotion';
      mc.addEventListener('change', () => { calm.set({ ...calm.get(), reduceMotion: mc.checked }); draw(); });
      mo.append(mc, el('span', '', 'Reduce motion (the system setting is respected too)'));
      body.appendChild(mo);
    };
    draw();
    form.appendChild(body);
    const close = el('button', 'btn primary', 'Done');
    close.type = 'button';
    close.addEventListener('click', () => done(true));
    form.appendChild(close);
    return close;
  });
}
