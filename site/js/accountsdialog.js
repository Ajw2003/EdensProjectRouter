// The Accounts box: shown folders with Hide, then the Hidden ones with Show again. DOM built with textContent only.
import { dialogShell } from './menu.js';
import { sameEmailNotes } from './accounts.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const why = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

export function openAccountsDialog(source) {
  return dialogShell('Accounts', (form, close) => {
    const body = el('div', 'accounts-box');
    form.appendChild(body);
    const err = el('p', 'grid-error');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    const actions = el('div', 'grid-dialog-actions');
    const ok = el('button', 'btn primary', 'Done');
    ok.type = 'button';
    ok.addEventListener('click', () => close(true));
    actions.appendChild(ok);
    form.appendChild(actions);

    const row = (a, note, label, hidden) => {
      const li = el('li', 'phone-device');
      const count = a.sessionCount + (a.sessionCount === 1 ? ' session' : ' sessions');
      li.appendChild(el('span', '', (a.email || 'no email') + ' · ' + a.name + ' · ' + count + (note ? ' · same email as ' + note : '')));
      const b = el('button', 'btn small', label);
      b.type = 'button';
      b.setAttribute('aria-label', label + ' ' + a.name);
      b.addEventListener('click', async () => {
        try { await source.setAccountHidden(a.id, hidden); err.textContent = ''; window.dispatchEvent(new Event('router:refresh')); } catch (e) { err.textContent = 'Could not change ' + a.name + ': ' + why(e); }
        draw();
      });
      li.appendChild(b);
      return li;
    };
    async function draw() {
      let all;
      try { all = await source.listAllAccounts(); } catch (e) { err.textContent = 'Could not list the folders: ' + why(e); return; }
      body.textContent = '';
      const shown = all.filter((a) => !a.hidden);
      const hidden = all.filter((a) => a.hidden);
      const notes = sameEmailNotes(shown);
      const ul = el('ul', 'phone-devices');
      if (!shown.length) ul.appendChild(el('li', 'phone-none', 'No folder is shown.'));
      for (const a of shown) ul.appendChild(row(a, notes[a.id], 'Hide', true));
      body.appendChild(ul);
      body.appendChild(el('h3', '', 'Hidden'));
      const hl = el('ul', 'phone-devices');
      if (!hidden.length) hl.appendChild(el('li', 'phone-none', 'No folder is hidden.'));
      for (const a of hidden) hl.appendChild(row(a, '', 'Show again', false));
      body.appendChild(hl);
    }
    draw();
  });
}
