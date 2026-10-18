// A popup menu (button + list) and two small dialogs, shared by the pill and the strip. DOM built with textContent only.
// Keyboard: Arrow Up/Down, Home, End move; Enter/Space pick; Escape closes and returns focus to the button; Tab closes.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let open = null; // { close() } of the menu that is showing

export function menuIsOpen() { return !!open; }

// items: [{ label, detail?, checked?, run() }]; a falsy item is skipped; { separator: true } draws a line.
export function openMenu(anchor, items, opts = {}) {
  if (open) open.close();
  const menu = el('div', 'grid-menu acct-menu');
  menu.setAttribute('role', 'menu');
  if (opts.label) menu.setAttribute('aria-label', opts.label);
  const radio = items.some((i) => i && i.checked !== undefined);
  const buttons = [];
  const close = (refocus) => {
    menu.remove();
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    anchor.setAttribute('aria-expanded', 'false');
    if (open && open.menu === menu) open = null;
    if (refocus && anchor.isConnected) anchor.focus();
  };
  const onDown = (e) => { if (!menu.contains(e.target) && e.target !== anchor) close(false); };
  const move = (d) => {
    const i = buttons.indexOf(document.activeElement);
    const n = buttons.length;
    buttons[(i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n)].focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); buttons[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); buttons[buttons.length - 1].focus(); }
  };
  for (const it of items) {
    if (!it) continue;
    if (it.separator) { const s = el('div', 'acct-sep'); s.setAttribute('role', 'separator'); menu.appendChild(s); continue; }
    const b = el('button', 'grid-menu-item acct-item');
    b.type = 'button';
    b.setAttribute('role', radio && it.checked !== undefined ? 'menuitemradio' : 'menuitem');
    if (it.checked !== undefined) b.setAttribute('aria-checked', it.checked ? 'true' : 'false');
    b.appendChild(el('span', 'acct-item-label', (it.checked ? '✓ ' : '') + it.label));
    if (it.detail) b.appendChild(el('span', 'acct-item-detail', it.detail));
    b.addEventListener('click', () => { close(true); it.run(); });
    menu.appendChild(b);
    buttons.push(b);
  }
  if (!buttons.length) return null;
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 2) + 'px';
  menu.style.left = Math.max(4, Math.min(Math.round(r.left), window.innerWidth - 280)) + 'px';
  document.body.appendChild(menu);
  anchor.setAttribute('aria-expanded', 'true');
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  open = { menu, close: () => close(false) };
  buttons[0].focus();
  return menu;
}

// A button that opens a menu. getItems() is called on each open.
export function menuButton(cls, text, getItems, opts = {}) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  if (opts.label) b.setAttribute('aria-label', opts.label);
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-expanded') === 'true') { if (open) open.close(); return; }
    openMenu(b, getItems(), opts);
  });
  b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(b, getItems(), opts); }
  });
  return b;
}

function dialogShell(title, build) {
  return new Promise((resolve) => {
    const dlg = el('dialog', 'grid-dialog');
    const form = el('form');
    form.method = 'dialog';
    form.appendChild(el('h2', '', title));
    let result = null;
    const done = (v) => { result = v; dlg.close(); };
    const focus = build(form, done);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.showModal();
    if (focus) focus.focus();
  });
}

// Asks for one line of text. validate(text) may throw a message to show; returns the validated value or null on cancel.
export function askText({ title, label, okLabel, placeholder, validate }) {
  return dialogShell(title, (form, done) => {
    const field = el('label', 'grid-field');
    field.appendChild(el('span', '', label));
    const input = el('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    field.appendChild(input);
    form.appendChild(field);
    const err = el('p', 'grid-error');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    const row = el('div', 'grid-dialog-actions');
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => done(null));
    const ok = el('button', 'btn primary', okLabel || 'OK');
    ok.type = 'submit';
    row.append(cancel, ok);
    form.appendChild(row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try { done(validate ? validate(input.value) : input.value); } catch (ex) { err.textContent = ex && ex.message ? ex.message : String(ex); }
    });
    return input;
  });
}

// A yes/no question. Resolves true for the confirm button, false for Cancel or Escape.
export function confirmDialog({ title, message, okLabel, cancelLabel }) {
  return dialogShell(title, (form, done) => {
    form.appendChild(el('p', '', message));
    const row = el('div', 'grid-dialog-actions');
    const cancel = el('button', 'btn', cancelLabel || 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => done(false));
    const ok = el('button', 'btn primary', okLabel || 'OK');
    ok.type = 'button';
    ok.addEventListener('click', () => done(true));
    row.append(cancel, ok);
    form.appendChild(row);
    return cancel;
  }).then((v) => v === true);
}

// Pick one of several choices (radio buttons). choices: [{ value, label, detail? }]. Resolves the chosen value, or null on cancel.
export function choiceDialog({ title, message, choices, okLabel, selected }) {
  return dialogShell(title, (form, done) => {
    if (message) form.appendChild(el('p', '', message));
    const group = el('fieldset', 'grid-choices');
    group.appendChild(el('legend', 'grid-sr', title));
    const name = 'choice' + Math.random().toString(36).slice(2, 8);
    let first = null;
    choices.forEach((c, i) => {
      const label = el('label', 'grid-choice');
      const r = el('input');
      r.type = 'radio';
      r.name = name;
      r.value = c.value;
      r.checked = c.value === (selected !== undefined ? selected : choices[0].value);
      label.appendChild(r);
      const words = el('span', 'grid-choice-text');
      words.appendChild(el('span', '', c.label));
      if (c.detail) words.appendChild(el('span', 'grid-choice-detail', c.detail));
      label.appendChild(words);
      group.appendChild(label);
      if (r.checked || (i === 0 && !first)) first = r;
    });
    form.appendChild(group);
    const row = el('div', 'grid-dialog-actions');
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => done(null));
    const ok = el('button', 'btn primary', okLabel || 'OK');
    ok.type = 'submit';
    row.append(cancel, ok);
    form.appendChild(row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = group.querySelector('input:checked');
      done(r ? r.value : null);
    });
    return first;
  });
}
