// A pane for a cloud session (issue #41): title, repository, status and two buttons. DOM built with textContent only.
import { el } from './sessionview.js';

export const noCopyText = (repo) => 'No copy of ' + repo + ' on this PC yet: clone it first.';

// pane = { id, params: { accountId, cloudId, title, repo, status, url } }. env = { onClose(), onFocus(), openExternal(url), continueHere(params) -> Promise,
// localCopy(repoName) -> { cwd } | null, notice(text) }
export function createCloudPane(root, pane, env) {
  const p = pane.params;
  const repoName = String(p.repo || '').split('/').pop();
  const section = el('section', 'pane pane-cloud');
  section.setAttribute('aria-label', 'Cloud session: ' + (p.title || ''));
  const bar = el('div', 'pane-bar');
  const icon = el('span', 'cloud-icon', '☁');
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', 'cloud');
  const close = el('button', 'pane-btn', '×');
  close.type = 'button';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close ' + (p.title || 'cloud session'));
  close.addEventListener('click', () => env.onClose());
  bar.append(icon, el('span', 'pane-grow'), close);
  const body = el('div', 'cloud-body');
  body.append(el('h2', 'cloud-title', p.title || 'Cloud session'), el('p', 'cloud-repo', p.repo || 'No repository'), el('p', 'cloud-status', 'Status: ' + (p.status || 'unknown')));
  const open = el('button', 'btn primary', 'Open on claude.ai');
  open.type = 'button';
  open.disabled = !p.url;
  open.addEventListener('click', () => {
    Promise.resolve().then(() => env.openExternal(p.url)).catch((e) => env.notice('Could not open claude.ai: ' + String((e && e.message) || e)));
  });
  const cont = el('button', 'btn', 'Continue on this PC');
  cont.type = 'button';
  const why = el('p', 'cloud-why');
  cont.addEventListener('click', () => {
    const copy = env.localCopy(repoName);
    if (!copy) { why.textContent = noCopyText(p.repo || repoName); return; }
    Promise.resolve().then(() => env.continueHere(p, copy)).catch((e) => env.notice('Could not continue on this PC: ' + String((e && e.message) || e)));
  });
  const actions = el('div', 'cloud-actions');
  actions.append(open, cont);
  body.append(actions, why);
  section.append(bar, body);
  section.addEventListener('mousedown', () => env.onFocus(), true);
  section.addEventListener('focusin', () => env.onFocus());
  root.appendChild(section);

  function drawCopy() {
    const none = !env.localCopy(repoName);
    cont.disabled = none;
    why.textContent = none ? noCopyText(p.repo || repoName) : '';
  }
  drawCopy();

  return {
    el: section,
    cloud: true,
    tile: { info: () => ({ key: '', accountId: p.accountId, project: repoName, cloud: true }), dispose() {} },
    viz: { restyle() {}, questionText: () => '', dispose() {} },
    showFocus() {},
    setActive(on) { section.classList.toggle('active', on); },
    update() { drawCopy(); },
    dispose() { section.remove(); },
  };
}
