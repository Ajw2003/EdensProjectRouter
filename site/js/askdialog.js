// Ask another session (issue #22, Windows app only). From a session tile: pick another session, type a question, then either
// send that session's cleaned copy with the question (free) or ask a read-only copy of it (uses usage). Both end as text typed
// into the asking session's prompt without Enter. Nothing is written to the other session's transcript or project folder.
// env = { source, grid, notice, getModel() }. DOM through textContent only.
import { dialogShell } from './menu.js';
import { parseTranscript } from './transcript.js';
import { cleanedCopy, handoffFileName, mentionText } from './handoff.js';
import { accountLabel } from './accounts.js';
import { validateQuestion, answerFileName, readOnlyState, readOnlyLabel, pickerList } from './ask.js';

const msgOf = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// A line break typed into a terminal would press Enter, so the typed text is one line.
const oneLine = (q) => q.replace(/\s*[\r\n]+\s*/g, ' ');

export function createAsk(env) {
  const allSessions = () => (env.getModel().groups || []).flatMap((g) => g.sessions);
  const acctOf = (s) => (env.getModel().accounts || []).find((a) => a.id === s.accountId) || { id: s.accountId, name: s.accountId };

  // asking = { tileId, accountId, id (or null), cwd, title }
  async function open(asking) {
    if (!asking.cwd) return env.notice('This session has no project folder yet, so a file cannot be placed for it.');
    const choice = await dialog(asking);
    if (!choice) return;
    try {
      if (choice.mode === 'free') await sendConversation(asking, choice);
      else await askCopy(asking, choice);
    } catch (e) {
      env.notice('Could not ask “' + choice.session.title + '”: ' + msgOf(e));
    }
  }

  function dialog(asking) {
    return dialogShell('Ask another session', (form, done) => {
      let picked = null;
      let allow = false;
      const sessions = allSessions();
      form.appendChild(el('p', '', 'Pick the session to ask about, then type your question for it.'));

      const find = el('label', 'grid-field');
      find.appendChild(el('span', '', 'Find a session'));
      const search = el('input');
      search.type = 'search';
      search.placeholder = 'Title, project or id';
      find.appendChild(search);
      form.appendChild(find);

      const list = el('div', 'ask-list');
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'Sessions');
      form.appendChild(list);

      const q = el('label', 'grid-field');
      q.appendChild(el('span', '', 'Your question'));
      const box = el('textarea');
      box.rows = 3;
      box.placeholder = 'What do you want to know?';
      q.appendChild(box);
      form.appendChild(q);

      const err = el('p', 'grid-error');
      err.setAttribute('role', 'alert');
      form.appendChild(err);

      const free = el('button', 'btn primary', 'Send the conversation with my question');
      free.type = 'button';
      const freeNote = el('p', 'ask-note', 'Free. Copies that conversation into this project’s .router-handoff folder and types its @file and your question here.');
      const ro = el('button', 'btn', 'Ask a read-only copy');
      ro.type = 'button';
      const roWhy = el('p', 'ask-note');
      roWhy.id = 'ask-ro-why';
      ro.setAttribute('aria-describedby', roWhy.id);
      const cbWrap = el('label', 'ask-allow');
      const cb = el('input');
      cb.type = 'checkbox';
      cbWrap.append(cb, el('span', '', 'Ask without a limit reading'));
      const cancel = el('button', 'btn', 'Cancel');
      cancel.type = 'button';
      form.append(free, freeNote, ro, roWhy, cbWrap);
      const row = el('div', 'grid-dialog-actions');
      row.appendChild(cancel);
      form.appendChild(row);

      const refreshRo = () => {
        cbWrap.hidden = true;
        if (!picked) {
          ro.textContent = 'Ask a read-only copy';
          ro.disabled = true;
          roWhy.textContent = 'Pick a session first.';
          free.disabled = true;
          return;
        }
        free.disabled = false;
        const a = acctOf(picked);
        const lim = (env.getModel().limitsByAccount || {})[picked.accountId];
        ro.textContent = readOnlyLabel(accountLabel(a), lim);
        const st = readOnlyState(lim, allow, accountLabel(a));
        ro.disabled = !st.enabled;
        roWhy.textContent = st.enabled ? 'Claude answers from a read-only copy; the original session is not changed.' : st.reason;
        cbWrap.hidden = !st.unknown;
      };

      const draw = () => {
        list.replaceChildren();
        const rows = pickerList(sessions, asking, search.value);
        if (!rows.length) list.appendChild(el('p', 'ask-note', sessions.length ? 'No session matches.' : 'There are no other sessions.'));
        for (const s of rows) {
          const lab = el('label', 'grid-choice ask-row');
          const r = el('input');
          r.type = 'radio';
          r.name = 'ask-session';
          r.checked = !!picked && picked.id === s.id && picked.accountId === s.accountId;
          r.addEventListener('change', () => { picked = s; err.textContent = ''; refreshRo(); });
          const words = el('span', 'grid-choice-text');
          words.appendChild(el('span', '', s.title));
          words.appendChild(el('span', 'grid-choice-detail', s.project + ' · ' + accountLabel(acctOf(s)) + (s.lastActiveMs ? ' · ' + new Date(s.lastActiveMs).toLocaleString() : '')));
          lab.append(r, words);
          list.appendChild(lab);
        }
      };

      const go = (mode) => {
        try {
          if (!picked) throw new Error('Pick a session first.');
          const question = validateQuestion(box.value);
          done({ mode, session: picked, question });
        } catch (ex) { err.textContent = ex.message; }
      };
      search.addEventListener('input', draw);
      box.addEventListener('input', () => { err.textContent = ''; });
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
      cb.addEventListener('change', () => { allow = cb.checked; refreshRo(); });
      free.addEventListener('click', () => go('free'));
      ro.addEventListener('click', () => go('readonly'));
      cancel.addEventListener('click', () => done(null));
      draw();
      refreshRo();
      return search;
    });
  }

  async function sendConversation(asking, c) {
    const s = c.session;
    if (!s.file) throw new Error('That conversation has no saved transcript yet.');
    const r = await env.source.readTranscript(s.accountId, s.projectDir, s.file, 0);
    const ms = s.lastActiveMs || Date.now();
    const md = cleanedCopy(parseTranscript(r.text).entries, { title: s.title, project: s.project, ms, id: s.id });
    const name = handoffFileName(ms, s.title, await env.source.handoffList(asking.cwd));
    const w = await env.source.handoffWrite(asking.cwd, name, md);
    await type(asking, mentionText(asking.cwd, w.path), oneLine(c.question));
  }

  async function askCopy(asking, c) {
    const s = c.session;
    if (!s.cwd) throw new Error('That session has no project folder, so it cannot be asked.');
    env.notice('Asking a read-only copy of “' + s.title + '”. This can take a minute or two.');
    const out = await env.source.handoffAsk({ id: s.id, accountId: s.accountId, cwd: s.cwd, question: c.question });
    const name = answerFileName(Date.now(), c.question, await env.source.handoffList(asking.cwd));
    const md = '# Answer from “' + s.title + '”\n\nProject: ' + s.project + ' · Session: ' + s.id + '\n\nQuestion: ' + c.question + '\n\n' + out;
    const w = await env.source.handoffWrite(asking.cwd, name, md);
    await type(asking, mentionText(asking.cwd, w.path), '');
  }

  async function type(asking, mention, rest) {
    if (!mention) throw new Error('The file was not placed inside the project folder.');
    const text = mention + rest;
    const r = await env.grid.deliver(asking.tileId, text);
    env.notice('Typed ' + text.trim() + ' into ' + (asking.title || 'the session') + '. Press Enter there to send it.' + (r.quiet ? '' : ' (It was still printing after 20 seconds, so it was typed anyway.)'));
  }

  return { open };
}
