// Limits strip in the top bar: the account a new session would use, its two bars, and one button to turn
// limit tracking on everywhere.
import { accountForNewSession } from './limits.js';
import { resetText, barLevel } from './board.js';

// Ids of accounts whose limit tracking is off. Accounts that still need permission are skipped.
// states: { [accountId]: 'on' | 'off' | ... }
export function planReporterAll(accounts, states) {
  const st = states || {};
  return (accounts || []).filter((a) => !a.needsPermission && (st[a.id] ?? 'off') === 'off').map((a) => a.id);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function bar(label, pct, resetsAt, nowMs) {
  const wrap = el('div', 'strip-bar');
  if (pct == null) {
    wrap.append(el('span', 'bar-label', label), el('span', 'bar-val', 'no reading'));
    return wrap;
  }
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const rt = resetText(resetsAt, nowMs);
  wrap.append(el('span', 'bar-label', label), el('span', 'bar-val', p + '%' + (rt ? ' · ' + rt : '')));
  const track = el('div', 'track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuenow', String(p));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = el('div', 'fill ' + barLevel(p));
  fill.style.width = p + '%';
  track.appendChild(fill);
  wrap.appendChild(track);
  return wrap;
}

// model: { accounts, limitsByAccount, states, nowMs }; handlers: { onReporterAll }
export function renderStrip(container, model, handlers) {
  container.textContent = '';
  const accounts = model.accounts || [];
  const id = accountForNewSession(accounts, model.limitsByAccount);
  const acct = accounts.find((a) => a.id === id);
  if (acct) {
    const lim = (model.limitsByAccount || {})[id];
    const states = model.states || {};
    container.appendChild(el('span', 'strip-name', acct.name));
    if (lim) {
      container.appendChild(bar('5-hour', lim.fiveHourPct, lim.fiveHourResetsAt, model.nowMs));
      container.appendChild(bar('Weekly', lim.weeklyPct, lim.weeklyResetsAt, model.nowMs));
    } else if (states[id] === 'on') {
      container.appendChild(el('span', 'strip-wait', "Waiting for Claude's next reply"));
    }
  }
  if (planReporterAll(accounts, model.states).length) {
    const b = el('button', 'btn small', 'Turn on limit tracking');
    b.type = 'button';
    b.addEventListener('click', () => handlers.onReporterAll());
    container.appendChild(b);
  }
}
