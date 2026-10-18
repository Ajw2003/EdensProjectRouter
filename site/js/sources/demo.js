// Fake source for ?demo=1: three accounts, four projects, seven sessions. Implements the source contract.
const MIN = 60000;
const now = () => Date.now();

const ACCOUNTS = [
  { id: 'demo-main', name: '.claude' },
  { id: 'demo-work', name: '.claude-work' },
  { id: 'demo-spare', name: '.claude-spare' },
];
// [account, project, session id, title, minutes ago, context tokens]
const SESSIONS = [
  ['demo-main', 'web-shop', 'a1', 'Fix checkout rounding bug', 3, 61000],
  ['demo-main', 'web-shop', 'a2', 'Add gift card field', 95, 150000],
  ['demo-main', 'notes-app', 'a3', 'Sync notes offline', 40, 182000],
  ['demo-work', 'billing-api', 'b1', 'Migrate invoices table', 12, 420000],
  ['demo-work', 'billing-api', 'b2', 'Write retry tests', 300, 24000],
  ['demo-work', 'dotfiles', 'b3', 'Tidy shell aliases', 1500, 9000],
  ['demo-spare', 'notes-app', 'c1', 'Try dark theme', 200, 90000],
];

function transcript(s) {
  const [, project, , title, ago, tokens] = s;
  const ts = new Date(now() - ago * MIN).toISOString();
  const cwd = 'C:\\Users\\demo\\code\\' + project;
  return [
    JSON.stringify({ type: 'ai-title', aiTitle: title }),
    JSON.stringify({ type: 'user', cwd, timestamp: ts, message: { content: title } }),
    JSON.stringify({ type: 'assistant', cwd, timestamp: ts, message: { model: 'claude-sonnet', usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
  ].join('\n');
}

const reporter = { 'demo-main': 'on', 'demo-work': 'on', 'demo-spare': 'off' };

export const source = {
  kind: 'browser',
  supported: true,
  async listAccounts() { return ACCOUNTS.map((a) => ({ ...a, needsPermission: false })); },
  async addAccount() { return null; },
  async grantPermission() { return true; },
  async listSessionFiles(id) {
    // Fixed size and mtime so the demo is parsed once; "minutes ago" is fixed at first call.
    return SESSIONS.filter((s) => s[0] === id).map((s) => ({
      project: 'C--Users-demo-code-' + s[1], file: s[2] + '.jsonl', size: 1000, mtimeMs: START - s[4] * MIN,
    }));
  },
  async readSessionText(id, project, file) {
    const s = SESSIONS.find((x) => x[0] === id && x[2] + '.jsonl' === file);
    if (!s) throw new Error('Demo session not found: ' + file);
    return { text: transcript(s), wasCut: false };
  },
  async readStatus(id) {
    const t = Math.floor(now() / 1000);
    const mk = (sid, five, wk, ctx, fiveIn, wkIn) => ({
      session_id: sid, savedAtMs: now(),
      rate_limits: { five_hour: { used_percentage: five, resets_at: t + fiveIn }, seven_day: { used_percentage: wk, resets_at: t + wkIn } },
      context_window: { used_percentage: ctx },
    });
    if (id === 'demo-main') return [mk('a1', 34, 52, 31, 2 * 3600, 3 * 86400)];
    if (id === 'demo-work') return [mk('b1', 92, 78, 42, 50 * 60, 86400 * 2)];
    return []; // .claude-spare: no readings
  },
  async reporterState(id) { return reporter[id] || 'off'; },
  async setReporter(id, on) { reporter[id] = on ? 'on' : 'off'; },
};
const START = now();
export default source;
