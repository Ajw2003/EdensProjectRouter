// The side panel of the Visual view: a page, a picture at full size, Markdown, the Files panel or the Pages shelf, beside the chat.
// A page that copies text gets "Send my choices", which types it into this session. DOM built with textContent only.
import { el, button } from './sessionview.js';
import { relativeTime } from './board.js';
import { renderMarkdownDoc } from './markdownview.js';
import { textToType } from './sendreply.js';
import { keysForMessage } from './visualcards.js';
import { routerFileUrl } from './visualsfind.js';
import { KIND_LABEL } from './visualpanels.js';

let markedLoading = null;
function loadMarked() {
  if (window.marked) return Promise.resolve(window.marked);
  if (markedLoading) return markedLoading;
  markedLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/marked/marked.umd.js';
    s.onload = () => (window.marked ? res(window.marked) : rej(new Error('The Markdown library did not load.')));
    s.onerror = () => rej(new Error('Could not load vendor/marked/marked.umd.js (run npm install in the desktop folder).'));
    document.head.appendChild(s);
  });
  markedLoading.catch(() => { markedLoading = null; });
  return markedLoading;
}
const msg = (e) => String(e && e.message ? e.message : e);

// env = { source, notice, typeKeys(keys, what) -> Promise<boolean> }
export function createSide(root, env) {
  root.classList.add('vz-side');
  root.hidden = true;
  const title = el('strong', 'vz-side-title');
  const closeBtn = button('Close', () => close(), 'small');
  closeBtn.setAttribute('aria-label', 'Close the side panel');
  const head = el('div', 'vz-side-head');
  head.append(title, el('span', 'pane-grow'), closeBtn);
  const bar = el('div', 'vz-send');
  bar.hidden = true;
  const body = el('div', 'vz-side-body');
  root.append(head, bar, body);
  let token = 0;

  function close() { token++; root.hidden = true; body.textContent = ''; bar.hidden = true; }
  function begin(t) { token++; root.hidden = false; title.textContent = t; body.textContent = ''; bar.hidden = true; bar.textContent = ''; return token; }
  const note = (t) => body.appendChild(el('p', 'vz-note', t));

  function drawSend(text) {
    bar.textContent = '';
    bar.hidden = false;
    const b = button('Send my choices', async () => {
      b.disabled = true;
      const ok = await env.typeKeys(keysForMessage(textToType(text)), 'send your choices');
      bar.textContent = '';
      bar.appendChild(el('span', 'vz-send-msg', ok ? 'Sent to this session.' : 'Not sent.'));
    }, 'small primary');
    b.title = 'Type what the page copied into this session and press Enter';
    bar.append(b, button('Dismiss', () => { bar.hidden = true; }, 'small'));
  }

  // item = { path, kind, name, url }. An artifact opens in the browser instead.
  async function openItem(item) {
    if (item.kind === 'artifact') return Promise.resolve(env.source.openVisualFile(item.path)).catch((e) => env.notice('Could not open it: ' + msg(e)));
    const my = begin(item.name);
    try {
      if (item.kind === 'image') {
        const img = el('img', 'vz-full');
        img.alt = item.name;
        img.src = item.url;
        img.addEventListener('error', () => { body.textContent = ''; note('The picture could not be loaded.'); });
        body.appendChild(img);
      } else if (item.kind === 'video') {
        const v = el('video', 'vz-full');
        v.controls = true; // never autoplays
        v.src = item.url;
        body.appendChild(v);
      } else if (item.kind === 'pdf') {
        const f = el('iframe', 'vz-frame');
        f.title = item.name;
        f.src = item.url;
        body.appendChild(f);
      } else if (item.kind === 'markdown') {
        const [text, marked] = await Promise.all([env.source.readVisualText(item.path), loadMarked()]);
        if (my !== token) return;
        const f = el('iframe', 'vz-frame');
        f.title = item.name;
        f.setAttribute('sandbox', '');
        f.srcdoc = renderMarkdownDoc(marked, text);
        body.appendChild(f);
      } else {
        const w = document.createElement('webview');
        w.className = 'vz-webview';
        w.setAttribute('partition', 'router-pages');
        w.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
        w.setAttribute('title', item.name);
        w.setAttribute('src', item.url);
        w.addEventListener('ipc-message', (ev) => { if (ev.channel === 'router:copied' && typeof ev.args[0] === 'string' && textToType(ev.args[0])) drawSend(ev.args[0]); });
        body.appendChild(w);
      }
    } catch (e) { if (my === token) { body.textContent = ''; note('Could not show ' + item.name + ': ' + msg(e)); } }
  }

  // files = filesFromEvents(); each file opens the read-only before and after of its changes.
  function showFiles(files) {
    begin('Files changed in this session');
    if (!files.length) return note('Nothing has been changed or made in this session yet.');
    for (const f of files) {
      const d = el('details', 'vz-file');
      d.append(el('summary', '', f.name + ' (' + f.changes.length + (f.changes.length === 1 ? ' change)' : ' changes)')), el('p', 'vz-path', f.path));
      for (const c of f.changes) {
        d.appendChild(el('p', 'vz-why', c.summary));
        for (const e of c.edits) {
          const pair = el('div', 'vz-ba');
          for (const [label, text] of [['Before', e.before], ['After', e.after]]) {
            const col = el('div', 'vz-ba-col');
            col.append(el('span', 'sv-who', label), el('pre', 'vz-result', text || '(empty)'));
            pair.appendChild(col);
          }
          d.appendChild(pair);
        }
      }
      body.appendChild(d);
    }
  }

  // entries = the project's visuals (listVisuals entries); a row opens it here.
  function showShelf(project, entries, problems) {
    begin('Pages · ' + project);
    for (const p of problems || []) note(p);
    if (!entries.length) return note('Nothing here yet. Pages, diagrams and pictures Claude makes in this project appear here.');
    const list = el('div', 'vz-shelf');
    list.setAttribute('role', 'list');
    const now = Date.now();
    for (const e of entries) {
      const b = el('button', 'vz-item');
      b.type = 'button';
      b.setAttribute('role', 'listitem');
      b.title = e.path;
      b.append(el('span', 'vz-name', e.name), el('span', 'vz-kind', KIND_LABEL[e.kind] || e.kind), el('span', 'vz-time', e.at ? relativeTime(e.at, now) : ''));
      b.addEventListener('click', () => openItem({ path: e.path, kind: e.kind, name: e.name, url: routerFileUrl(e.path, e.at) }));
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  // A panel the caller built (the Details panel).
  function showNode(t, node) { begin(t); body.appendChild(node); }

  return { openItem, showFiles, showShelf, showNode, close };
}
