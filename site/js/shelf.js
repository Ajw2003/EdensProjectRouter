// The Pages shelf's data: the visuals of a project over all accounts. (Moved from the old Visuals tile, which the shelf replaces.)
import { mergeVisuals } from './visualsfind.js';

// The sessions of one project, grouped by account: [{ accountId, project: { name, sessions } }]
export function sessionsByAccount(model, project) {
  const g = (model.groups || []).find((x) => x.project === project);
  const by = new Map();
  for (const s of g ? g.sessions : []) {
    if (!by.has(s.accountId)) by.set(s.accountId, []);
    by.get(s.accountId).push({ id: s.id, projectDir: s.projectDir, file: s.file, cwd: s.cwd });
  }
  return [...by].map(([accountId, sessions]) => ({ accountId, project: { name: project, sessions } }));
}

// Lists the visuals of a project over all accounts: { entries (with accountId), problems }.
export async function loadProjectVisuals(source, model, project) {
  const lists = [];
  const problems = [];
  for (const a of sessionsByAccount(model, project)) {
    try {
      const r = await source.listVisuals(a.accountId, a.project);
      lists.push(r.entries.map((e) => ({ ...e, accountId: a.accountId })));
      problems.push(...(r.problems || []));
    } catch (e) {
      problems.push('Could not list pictures and pages for ' + a.accountId + ': ' + (e && e.message ? e.message : e));
    }
  }
  return { entries: mergeVisuals(...lists), problems };
}
