// The orange "Continue on <account>" button, shown when the session's account is full and another has room (pane header and Visual view).
import { continueTarget, accountLabel } from './accounts.js';

const msg = (e) => String(e && e.message ? e.message : e);

// getTile() -> the session tile (info(), continueOn()); getModel() -> { accounts, limitsByAccount }.
export function createContinueButton(getTile, getModel, notice) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn continue-btn';
  b.hidden = true;
  let target = null;
  b.addEventListener('click', async () => {
    if (!target) return;
    b.disabled = true;
    try { await getTile().continueOn(target.id); } catch (e) { notice('Could not continue: ' + msg(e)); } finally { b.disabled = false; }
  });
  return {
    el: b,
    update() {
      const tile = getTile();
      const i = tile && tile.info();
      const m = getModel();
      target = i && i.sessionId ? continueTarget(m.accounts, m.limitsByAccount, i.accountId) : null;
      b.hidden = !target;
      if (target) b.textContent = 'Continue on ' + accountLabel(target);
    },
  };
}
