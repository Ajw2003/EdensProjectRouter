'use strict';
// Cloud sessions reader (issue #40). Read-only: reads <account>/.credentials.json, asks api.anthropic.com for the
// account's claude.ai/code sessions. Never writes a file, never logs or returns the token.
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 15000;

function repoFromUrl(url) {
  const s = String(url || '').trim();
  const m = /^(?:https?:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(s);
  return m ? { repo: m[1] + '/' + m[2], repoName: m[2] } : { repo: '', repoName: '' };
}

function readToken(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, '.credentials.json'), 'utf8'));
    const o = j && j.claudeAiOauth;
    if (o && typeof o.accessToken === 'string' && o.accessToken) return { token: o.accessToken, expiresAt: Number(o.expiresAt) };
  } catch (_) { /* unreadable or missing: reported as no-sign-in below */ }
  return null;
}

function createCloudReader({ fetch = global.fetch, now = Date.now, base = 'https://api.anthropic.com' } = {}) {
  async function readAccount(dir) {
    const cred = readToken(dir);
    if (!cred) return { state: 'no-sign-in', message: 'No sign-in found for this account.', sessions: [] };
    if (Number.isFinite(cred.expiresAt) && cred.expiresAt <= now()) {
      return { state: 'expired', message: 'Sign-in out of date.', sessions: [] };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(base + '/v1/code/sessions', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + cred.token, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
        signal: ac.signal,
      });
      if (res.status === 401) return { state: 'expired', message: 'Sign-in out of date.', sessions: [] };
      if (res.status !== 200) return { state: 'error', message: 'The server answered ' + res.status + '.', sessions: [] };
      const body = await res.json();
      const list = Array.isArray(body && body.data) ? body.data : [];
      const sessions = list.filter((s) => s && s.id && s.status !== 'archived').map((s) => {
        const src = ((s.config && s.config.sources) || []).find((x) => x && x.type === 'git_repository');
        const { repo, repoName } = repoFromUrl(src && src.url);
        const created = s.created_at ? Date.parse(s.created_at) : NaN;
        const last = s.last_event_at ? Date.parse(s.last_event_at) : NaN;
        return {
          id: s.id,
          title: (s.title && String(s.title).trim()) || 'Untitled cloud session',
          status: s.worker_status || s.status || '',
          repo, repoName,
          createdAt: s.created_at || '',
          lastActiveMs: Number.isFinite(last) ? last : (Number.isFinite(created) ? created : 0),
          url: 'https://claude.ai/code/' + s.id,
        };
      });
      return { state: 'ok', sessions };
    } catch (e) {
      const msg = e && e.name === 'AbortError' ? 'The server did not answer in 15 seconds.' : 'Could not reach the server.';
      return { state: 'error', message: msg, sessions: [] };
    } finally {
      clearTimeout(timer);
    }
  }
  return { readAccount };
}

module.exports = { createCloudReader, repoFromUrl };
