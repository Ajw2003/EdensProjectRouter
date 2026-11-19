// The New session box: pick a project and an account (the one with most room is marked Suggested), then Start.
import { dialogShell } from './menu.js';
import { accountChoices } from './accounts.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// projects: [{ project, cwd }]. Resolves { project, cwd, accountId } or null on cancel.
export function askNewSession({ projects, accounts, limitsByAccount }) {
  return dialogShell('New session', (form, done) => {
    const field = el('label', 'grid-field');
    field.appendChild(el('span', '', 'Project'));
    const sel = el('select');
    projects.forEach((p, i) => { const o = el('option', '', p.project); o.value = String(i); sel.appendChild(o); });
    field.appendChild(sel);
    form.appendChild(field);
    const group = el('fieldset', 'grid-choices');
    group.appendChild(el('legend', '', 'Account'));
    const choices = accountChoices(accounts, limitsByAccount);
    const radios = choices.map((c) => {
      const label = el('label', 'grid-choice');
      const r = el('input');
      r.type = 'radio'; r.name = 'ns-account'; r.value = c.id; r.checked = c.suggested;
      const words = el('span', 'grid-choice-text');
      words.appendChild(el('span', '', c.label + (c.suggested ? ' · Suggested' : '')));
      words.appendChild(el('span', 'grid-choice-detail', c.usage));
      label.append(r, words);
      group.appendChild(label);
      return r;
    });
    form.appendChild(group);
    const row = el('div', 'grid-dialog-actions');
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => done(null));
    const ok = el('button', 'btn primary', 'Start');
    ok.type = 'submit';
    row.append(cancel, ok);
    form.appendChild(row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = radios.find((x) => x.checked);
      if (r) done({ ...projects[Number(sel.value)], accountId: r.value });
    });
    return sel;
  });
}
