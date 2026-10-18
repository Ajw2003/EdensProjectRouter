// Pure: turns raw first-user-message text into a short readable title, or '' for text Claude Code inserted itself.

const SYSTEM_TAGS = ['task-notification', 'local-command-caveat', 'local-command-stdout', 'local-command-stderr',
  'system-reminder', 'bash-stdout', 'bash-stderr', 'user-prompt-submit-hook', 'command-message'];
const SYSTEM_STARTS = ['Stop hook feedback', 'Base directory for this skill', 'Caveat:', '[Request interrupted',
  'This session is being continued from a previous conversation'];

export function cleanTitle(raw, maxLength = 60) {
  let t = String(raw == null ? '' : raw).trim();
  if (!t) return '';
  for (const tag of SYSTEM_TAGS) if (t.startsWith('<' + tag + '>') || t.startsWith('<' + tag + ' ')) return '';
  for (const s of SYSTEM_STARTS) if (t.startsWith(s)) return '';
  t = t.replace(/<command-name>([\s\S]*?)<\/command-name>(?:\s*<command-message>[\s\S]*?<\/command-message>)?(?:\s*<command-args>([\s\S]*?)<\/command-args>)?/g,
    (m, name, args) => name.trim() + (args && args.trim() ? ' ' + args.trim() : ''));
  t = t.replace(/<bash-input>([\s\S]*?)<\/bash-input>/g, (m, cmd) => '! ' + cmd.trim());
  t = t.replace(/\[Image[^\]]*\]/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, maxLength);
}
