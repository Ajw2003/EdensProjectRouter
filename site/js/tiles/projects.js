// The Projects tile (every project, via renderList) and the single-project tile (one project's sessions).
import { renderList } from '../list.js';

// Pure: the model a project tile shows, only that project's group.
export function modelForProject(model, project) {
  return { ...model, groups: (model.groups || []).filter((g) => g.project === project) };
}

// env = { getModel(), getHandlers(), listState }
export function createProjectsTile(element, params, api, env) {
  element.classList.add('tile-list');
  const single = params.kind === 'project' ? params.project : null;
  return {
    update(model) {
      const m = single ? modelForProject(model, single) : model;
      renderList(element, m, env.getHandlers(), env.listState);
    },
    dispose() { element.textContent = ''; },
  };
}
