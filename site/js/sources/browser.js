// File System Access API source (Edge/Chrome). Implements the source contract, kind "browser".
import { planInstall, planRemove, isInstalled } from '../reporter.js';

const HEAD = 64 * 1024;
const TAIL = 256 * 1024;
const DB = 'edens-router';
const STORE = 'accounts';

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbAll() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function dbPut(rec) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(rec);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function handleFor(id) {
  const rec = (await dbAll()).find((a) => a.id === id);
  if (!rec) throw new Error('Unknown account ' + id);
  return rec.handle;
}
function sub(h, name, create) {
  return h.getDirectoryHandle(name, { create: !!create });
}
// Returns null only for a genuinely missing file; any other error is thrown.
async function readText(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch (e) {
    if (e && e.name === 'NotFoundError') return null;
    throw e;
  }
}
async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

export const source = {
  kind: 'browser',
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,

  async listAccounts() {
    const out = [];
    for (const a of await dbAll()) {
      try {
        const perm = await a.handle.queryPermission({ mode: 'read' });
        out.push({ id: a.id, name: a.name, needsPermission: perm !== 'granted' });
      } catch (e) {
        out.push({ id: a.id, name: a.name, needsPermission: true, error: String(e) });
      }
    }
    return out;
  },

  // Returns account, null (picker cancelled), or {error:'no-projects'|'unsupported'|'picker-failed', message, name?}
  async addAccount() {
    if (!this.supported) return { error: 'unsupported', message: 'This browser cannot open folders. Use Edge or Chrome.' };
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'claude-folder', mode: 'read' });
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      return { error: 'picker-failed', message: String(e) };
    }
    try {
      await sub(handle, 'projects');
    } catch (e) {
      if (e && e.name === 'NotFoundError') {
        return { error: 'no-projects', name: handle.name, message: 'That folder has no "projects" folder inside. Pick your .claude folder.' };
      }
      return { error: 'picker-failed', message: String(e) };
    }
    try {
      for (const a of await dbAll()) {
        if (await a.handle.isSameEntry(handle)) return { id: a.id, name: a.name, needsPermission: false };
      }
      const id = 'acct-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await dbPut({ id, name: handle.name, handle });
      return { id, name: handle.name, needsPermission: false };
    } catch (e) {
      return { error: 'storage-failed', message: 'Could not remember the folder: ' + String(e) };
    }
  },

  async grantPermission(id) {
    const h = await handleFor(id);
    return (await h.requestPermission({ mode: 'read' })) === 'granted';
  },

  async listSessionFiles(id) {
    const projects = await sub(await handleFor(id), 'projects');
    const out = [];
    for await (const [pname, p] of projects.entries()) {
      if (p.kind !== 'directory') continue;
      for await (const [fname, f] of p.entries()) {
        if (f.kind !== 'file' || !fname.endsWith('.jsonl')) continue;
        const file = await f.getFile();
        out.push({ project: pname, file: fname, size: file.size, mtimeMs: file.lastModified });
      }
    }
    return out;
  },

  // Returns {text, wasCut, joinLine?}. When cut, the head is trimmed to whole lines and
  // joinLine is the index of the first tail line (pass both to discovery.parseSession via meta).
  async readSessionText(id, project, fname) {
    const dir = await sub(await sub(await handleFor(id), 'projects'), project);
    const file = await (await dir.getFileHandle(fname)).getFile();
    if (file.size <= HEAD + TAIL) return { text: await file.text(), wasCut: false };
    let head = await file.slice(0, HEAD).text();
    const nl = head.lastIndexOf('\n');
    head = nl >= 0 ? head.slice(0, nl) : '';
    const tail = await file.slice(file.size - TAIL).text();
    const joinLine = head ? head.split('\n').length : 0;
    return { text: head + '\n' + tail, wasCut: true, joinLine };
  },

  async readStatus(id) {
    let dir;
    try {
      dir = await sub(await sub(await handleFor(id), 'router'), 'status');
    } catch (e) {
      if (e && e.name === 'NotFoundError') return [];
      throw e;
    }
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !name.endsWith('.json')) continue;
      const t = await (await h.getFile()).text();
      try {
        out.push(JSON.parse(t));
      } catch (e) {
        out.push({ error: 'bad-status-file', file: name, message: String(e) });
      }
    }
    return out;
  },

  async reporterState(id) {
    const text = await readText(await handleFor(id), 'settings.json');
    return text !== null && isInstalled(text) ? 'on' : 'off';
  },

  async setReporter(id, on) {
    const root = await handleFor(id);
    if ((await root.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new Error('Write permission was not given, so limit tracking was not changed.');
    }
    const router = await sub(root, 'router', true);
    const current = await readText(root, 'settings.json');
    const currentText = current === null ? '{}' : current;
    if (on) {
      let prevRaw = null;
      try {
        const sl = JSON.parse(currentText).statusLine;
        prevRaw = sl === undefined ? null : JSON.stringify(sl);
      } catch (e) {
        throw new Error('settings.json is not valid JSON, so it was left alone: ' + e);
      }
      const plan = planInstall(currentText, prevRaw);
      await writeText(root, 'settings.json.router-backup', plan.backupText);
      if (plan.previousStatusLineJson != null) await writeText(router, 'previous-statusline.json', plan.previousStatusLineJson);
      if (plan.previousCommandText != null) await writeText(router, 'previous-statusline.txt', plan.previousCommandText);
      await writeText(root, 'settings.json', plan.settingsText);
    } else {
      const plan = planRemove(currentText, await readText(router, 'previous-statusline.json'));
      await writeText(root, 'settings.json.router-backup', currentText);
      await writeText(root, 'settings.json', plan.settingsText);
    }
  },
};

export default source;
