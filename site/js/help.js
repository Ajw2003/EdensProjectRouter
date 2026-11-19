// The Help page: one card per task, each with a picture of the real app and up to three plain steps.
// It replaces the first-run walkthrough. Nothing opens on its own; the Help button opens it.

// where: 'app' shows only in the desktop app, 'web' only on the website, 'both' on both.
export const HELP_TASKS = [
  { id: 'folder', where: 'web', title: 'Add your Claude folder', picture: 'help/folder.png',
    alt: 'The top bar with the Add Claude folder and Help buttons at the right',
    steps: ['Tap Add Claude folder at the top right.', 'Pick the folder named .claude in your user folder, for example C:\\Users\\you\\.claude.', 'Other accounts are often named .claude-something, in the same place. Add each one the same way.'] },
  { id: 'open', where: 'app', title: 'Open a session', picture: 'help/open.png',
    alt: 'The session list on the left, with New session at the top and More and Help at the bottom',
    steps: ['Tap a session in the list on the left.', 'Type in Search sessions to find one by name.'] },
  { id: 'side', where: 'app', title: 'Put sessions side by side', picture: 'help/side.png',
    alt: 'Two sessions open next to each other',
    steps: ['Ctrl-click a session, tap Open beside, or drag it to the right.', 'Up to four fit. The × at the top right of a session closes it.'] },
  { id: 'views', where: 'app', title: 'Switch between Terminal and Visual', picture: 'help/views.png',
    alt: 'A session with the Terminal and Visual buttons at its top left',
    steps: ['Every session has Terminal and Visual at its top left.', 'Terminal is Claude Code itself. Visual shows the same session as messages and cards.'] },
  { id: 'needs', where: 'app', title: 'See what needs you', picture: 'help/needs.png',
    alt: 'A Needs you group at the top of the session list',
    steps: ['Sessions waiting on an answer from you sit under Needs you, at the top of the list.', 'Tap one to open it.'] },
  { id: 'answer', where: 'app', title: "Answer Claude's question", picture: 'help/answer.png',
    alt: 'A question card in the Visual view with one button per answer',
    steps: ['In Visual, a question shows as a card with one button per answer.', 'Tapping a button types that answer into Claude Code for you.'] },
  { id: 'new', where: 'app', title: 'Start a new session', picture: 'help/new.png',
    alt: 'The New session box with a project and two accounts, one marked Suggested',
    steps: ['Tap New session at the top of the list.', 'Pick the project. The account marked Suggested has the most room left.', 'Tap Start.'] },
  { id: 'full', where: 'app', title: 'Keep going when an account is full', picture: 'help/full.png',
    alt: 'An orange Continue on button at the top of a session',
    steps: ['When an account reaches its limit, an orange Continue button appears on the session.', 'Tap it to carry on the same work in the account it names.'] },
  { id: 'accounts', where: 'app', title: 'Add an account or a Claude folder', picture: 'help/accounts.png',
    alt: 'The More menu open, listing the accounts, What to show, Add account and Add Claude folder',
    steps: ['Tap More at the bottom of the list.', 'Pick Add account… or Add Claude folder.', 'The same menu sets which account new sessions use.'] },
  { id: 'show', where: 'app', title: 'Choose what to show', picture: 'help/show.png',
    alt: 'The What to show box with Calm, Balanced and Everything, and one switch per kind of information',
    steps: ['Tap More, then What to show…', 'Calm, Balanced and Everything are ready-made sets. Each switch shows or hides one kind of information.', 'Hiding something never deletes it.'] },
  { id: 'limits', where: 'both', title: 'Turn on limit tracking', picture: 'help/limits.png',
    alt: 'A session header with Context, 5-hour limit and Weekly limit bars',
    steps: ['Where a 5-hour or weekly limit has no numbers yet, tap Turn on limit tracking.', 'The numbers appear after Claude’s next reply in that account.', 'Blue is under 70%, amber is 70 to 89%, red is 90% and above.'] },
  { id: 'phone', where: 'app', title: 'Pair a phone', picture: 'help/phone.png',
    alt: 'The Pair a phone box with a QR code',
    steps: ['Tap More, then Phone link: off (turn on).', 'Tap More, then Pair a phone…', 'Scan the code with the Router app on the phone. The code works once and runs out in five minutes.'] },
];

/** The tasks for this kind of source: 'desktop' is the Windows app; anything else is the website. */
export function tasksFor(kind) {
  const here = kind === 'desktop' ? 'app' : 'web';
  return HELP_TASKS.filter((t) => t.where === 'both' || t.where === here);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Opens the Help page over the app. Escape or Close shuts it and puts focus back where it was. */
export function openHelp(kind) {
  if (document.querySelector('.help')) return;
  const back = document.activeElement;
  const root = el('section', 'help');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'help-title');
  const top = el('div', 'help-top');
  const h = el('h2', 'help-title', 'Help');
  h.id = 'help-title';
  h.tabIndex = -1;
  const close = el('button', 'btn', 'Close');
  close.type = 'button';
  top.append(h, close);
  root.appendChild(top);
  root.appendChild(el('p', 'help-lead', 'Each card is one thing you can do, with a picture of where to find it.'));
  const grid = el('div', 'help-grid');
  for (const t of tasksFor(kind)) {
    const card = el('article', 'help-card');
    card.appendChild(el('h3', '', t.title));
    const img = el('img', 'help-pic');
    img.src = t.picture;
    img.alt = t.alt;
    img.loading = 'lazy';
    card.appendChild(img);
    const ol = el('ol', 'help-steps');
    for (const s of t.steps) ol.appendChild(el('li', '', s));
    card.appendChild(ol);
    grid.appendChild(card);
  }
  root.appendChild(grid);
  function shut() {
    root.remove();
    document.removeEventListener('keydown', onKey);
    if (back && typeof back.focus === 'function') back.focus();
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); shut(); } }
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  h.focus();
}
