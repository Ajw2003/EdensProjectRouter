import { createPanels } from '../terminal.js';
// Thin wrapper over window.routerDesktop (Electron preload). Implements the source contract, kind "desktop".
const d = () => {
  if (typeof window === 'undefined' || !window.routerDesktop) throw new Error('The desktop bridge is missing.');
  return window.routerDesktop;
};

let known = null; // account ids seen by the last listAccounts/addAccount

export const source = {
  kind: 'desktop',
  supported: true,
  // Set by addAccount when it returns null, so the board can say why.
  lastMessage: '',

  async listAccounts() {
    const list = await d().listAccounts();
    known = new Set(list.map((a) => a.id));
    return list;
  },

  // Re-scans the user folder. Returns the first account not seen before, or null
  // (with lastMessage set) when nothing new turned up.
  async addAccount() {
    const before = known || new Set();
    const now = await d().listAccounts();
    known = new Set(now.map((a) => a.id));
    const fresh = now.find((a) => !before.has(a.id));
    if (fresh) {
      this.lastMessage = '';
      return fresh;
    }
    this.lastMessage = 'No new .claude folders were found in your user folder.';
    return null;
  },

  async grantPermission() { return true; },
  listSessionFiles: (id) => d().listSessionFiles(id),
  readSessionText: (id, project, file) => d().readSessionText(id, project, file),
  readTranscript: (id, project, file, fromByte) => d().readTranscript(id, project, file, fromByte),
  readStatus: (id) => d().readStatus(id),
  reporterState: (id) => d().reporterState(id),
  setReporter: (id, on) => d().setReporter(id, on),
  resume: (session) => d().resume(session),
  newSession: (cwd, accountId) => d().newSession(cwd, accountId),
  claudeRunning: () => d().claudeRunning(),
  layoutGet: () => d().layoutGet(),
  layoutSet: (data) => d().layoutSet(data),
  // Terminal panels running the real Claude Code (the browser and demo sources do not have this).
  createPanels: (onChange) => createPanels(d(), onChange),
};

export default source;
