// Send to… (issue #21, Windows app only): sends a file or a conversation to another session as an @mention typed into its prompt
// (no Enter), starts a sub-session (a --fork-session branch), and the "Keep hand-off files out of git" project setting.
// env = { source, grid, notice, getModel(), newSessionAccount() }. DOM is only touched through menu.js. textContent only.
import { openMenu, choiceDialog } from './menu.js';
import { parseTranscript } from './transcript.js';
import { cleanedCopy, handoffFileName, mentionText, matchFork } from './handoff.js';
import { accountLabel, usageText } from './accounts.js';

const msgOf = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

export function createSendTo(env) {
  const pending = []; // sub-sessions started here whose own conversation has not shown up yet

  const allSessions = () => (env.getModel().groups || []).flatMap((g) => g.sessions);
  const sessionOf = (src) => allSessions().find((s) => s.accountId === src.accountId && s.id === src.id) || null;

  // ----- targets -----
  async function tileTargets(src) {
    let tiles = [];
    try { tiles = await env.source.handoffTiles(); } catch (e) { env.notice('Could not list the open sessions: ' + msgOf(e)); }
    return tiles
      .filter((t) => t.cwd && !(src.kind === 'conversation' && t.sessionId === src.id && t.accountId === src.accountId))
      .map((t) => ({
        label: t.title || t.project,
        detail: [t.project, t.self ? '' : 'Window ' + t.winId, t.running ? 'running' : 'will be resumed'].filter(Boolean).join(' · '),
        run: () => send(src, { type: 'tile', id: t.id, winId: t.winId, self: t.self, cwd: t.cwd, title: t.title }),
      }));
  }

  function projectTargets(src) {
    return (env.getModel().groups || []).map((g) => ({
      label: g.project,
      run: () => send(src, { type: 'new', project: g.project, cwd: (g.sessions[0] && g.sessions[0].cwd) || '', title: 'a new session in ' + g.project }),
    }));
  }

  // The menu of everything one source can go to.
  async function open(anchor, src) {
    const items = await tileTargets(src);
    if (items.length) items.push({ separator: true });
    items.push({
      label: 'New session in…',
      run: () => {
        const projects = projectTargets(src);
        if (!projects.length) return env.notice('There are no projects to start a session in yet.');
        openMenu(anchor, projects, { label: 'Project for the new session' });
      },
    });
    if (src.kind === 'conversation') items.push({ label: 'Sub-session of this', run: () => fork(src) });
    openMenu(anchor, items, { label: 'Send to' });
  }

  // ----- what gets typed -----
  async function fileText(src, cwd) {
    const inside = mentionText(cwd, src.path);
    if (inside) return inside; // already in the target project: mention it where it is
    const copy = await env.source.handoffCopyFile(cwd, src.path);
    const m = mentionText(cwd, copy.path);
    if (!m) throw new Error('The copy was not placed inside the project folder.');
    return m;
  }

  async function conversationText(src, cwd, targetTitle) {
    const s = sessionOf(src);
    if (!s || !s.file) throw new Error('That conversation has no saved transcript yet.');
    const model = env.getModel();
    const acct = (model.accounts || []).find((a) => a.id === s.accountId);
    const usage = usageText((model.limitsByAccount || {})[s.accountId]).replace(' · ', ', ');
    const choice = await choiceDialog({
      title: 'Send conversation',
      message: 'Send “' + s.title + '” to ' + targetTitle + ' as a file in its .router-handoff folder.',
      okLabel: 'Send',
      choices: [
        { value: 'clean', label: 'Cleaned copy (free)', detail: 'Your messages, Claude’s replies and one line per tool, as Markdown.' },
        { value: 'summary', label: 'Summary (uses usage on ' + accountLabel(acct || { name: s.accountId }) + ': ' + usage + ')', detail: 'Claude writes a short handover from a read-only copy of the session.' },
      ],
    });
    if (!choice) return null;
    const ms = s.lastActiveMs || Date.now();
    const meta = { title: s.title, project: s.project, ms, id: s.id };
    let md;
    let title = s.title;
    if (choice === 'summary') {
      env.notice('Writing the summary of “' + s.title + '”. This can take a minute or two.');
      const out = await env.source.handoffSummary({ id: s.id, accountId: s.accountId, cwd: s.cwd });
      md = '# Summary: ' + s.title + '\n\nProject: ' + s.project + ' · Session: ' + s.id + '\n\n' + out;
      title = 'summary ' + s.title;
    } else {
      const r = await env.source.readTranscript(s.accountId, s.projectDir, s.file, 0);
      md = cleanedCopy(parseTranscript(r.text).entries, meta);
    }
    const name = handoffFileName(ms, title, await env.source.handoffList(cwd));
    const w = await env.source.handoffWrite(cwd, name, md);
    return mentionText(cwd, w.path);
  }

  // ----- sending -----
  async function send(src, target) {
    try {
      if (!target.cwd) throw new Error('The target has no project folder.');
      const text = src.kind === 'file' ? await fileText(src, target.cwd) : await conversationText(src, target.cwd, target.title || 'that session');
      if (text == null) return; // cancelled in the dialog
      let id = target.id;
      let local = target.self !== false;
      if (target.type === 'new') {
        const accountId = env.newSessionAccount();
        if (!accountId) throw new Error('Add a Claude folder first, then start a session.');
        id = env.grid.newSession(target.project, target.cwd, accountId);
        local = true;
      }
      if (local) {
        const r = await env.grid.deliver(id, text);
        env.notice('Typed ' + text.trim() + ' into ' + (target.title || 'the session') + '. Press Enter there to send it.' + (r.quiet ? '' : ' (It was still printing after 20 seconds, so it was typed anyway.)'));
      } else {
        await env.source.handoffRelay(target.winId, { id, text });
        env.notice('Sent ' + text.trim() + ' to window ' + target.winId + '. Press Enter there to send it.');
      }
    } catch (e) {
      env.notice('Could not send: ' + msgOf(e));
    }
  }

  // ----- sub-sessions -----
  function fork(src) {
    const s = sessionOf(src);
    if (!s || !s.cwd) return env.notice('That conversation is not saved yet, so it cannot be branched.');
    const known = allSessions().filter((x) => x.accountId === s.accountId && x.project === s.project).map((x) => x.id);
    env.grid.forkSession(s);
    pending.push({ parent: s.id, accountId: s.accountId, project: s.project, knownIds: known, startedMs: Date.now(), title: s.title });
    env.notice('Started a sub-session of “' + s.title + '”. It is listed under it once it has a conversation.');
  }

  // Called with each new model. The sub-session's id is not known when it starts, so the next new transcript of that account
  // and project (within 60 s) is taken as its own and the {child, parent} link is saved.
  function observe(model) {
    const sessions = (model.groups || []).flatMap((g) => g.sessions);
    for (const p of pending.slice()) {
      const r = matchFork(p, sessions, Date.now());
      if (!r) continue;
      pending.splice(pending.indexOf(p), 1);
      if (r.child) {
        Promise.resolve(env.source.handoffLinkAdd(r.child, p.parent))
          .then(() => window.dispatchEvent(new Event('router:refresh')))
          .catch((e) => env.notice('Could not remember that the new session belongs under “' + p.title + '”: ' + msgOf(e)));
      } else {
        env.notice('No new conversation appeared within a minute of starting the sub-session of “' + p.title + '”, so it is not listed under it.');
      }
    }
  }

  // ----- git exclude -----
  async function projectMenu(anchor, project, cwd) {
    if (!cwd) return env.notice('No folder is known for ' + project + ' yet.');
    let on;
    try { on = await env.source.gitExcludeGet(cwd); } catch (e) { return env.notice('Hand-off files in ' + project + ': ' + msgOf(e)); }
    openMenu(anchor, [{
      label: 'Keep hand-off files out of git',
      checked: on,
      run: async () => {
        try {
          const now = await env.source.gitExcludeSet(cwd, !on);
          env.notice(now ? '.router-handoff/ is now kept out of git for ' + project + '.' : '.router-handoff/ is no longer kept out of git for ' + project + '.');
        } catch (e) { env.notice('Could not change the git exclude for ' + project + ': ' + msgOf(e)); }
      },
    }], { label: 'Menu for ' + project });
  }

  return { open, projectMenu, observe };
}
