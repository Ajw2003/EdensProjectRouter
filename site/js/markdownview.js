// Pure: Markdown text -> a safe HTML document for a sandboxed iframe (srcdoc). Raw HTML in the Markdown is escaped, links are
// limited to http(s) and mailto, images show their alt text. `marked` is passed in (the page loads the vendor build).
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function safeHref(href) {
  const h = String(href || '').trim();
  return /^(https?:|mailto:)/i.test(h) ? h : '#';
}

const STYLE = 'body{font:15px/1.55 system-ui,sans-serif;margin:16px 20px;color:#1b1f23;background:#fff;max-width:80ch}'
  + 'pre,code{font-family:ui-monospace,Consolas,monospace;background:#f1f3f5;border-radius:4px}code{padding:1px 4px}pre{padding:10px;overflow:auto}pre code{padding:0}'
  + 'table{border-collapse:collapse}td,th{border:1px solid #c9d1d9;padding:4px 8px}blockquote{margin-left:0;padding-left:12px;border-left:4px solid #c9d1d9;color:#57606a}'
  + 'a{color:#0b5cad}h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.2em}';

export function renderMarkdownDoc(marked, text) {
  const m = new marked.Marked({
    gfm: true,
    renderer: {
      html(token) { return escapeHtml(typeof token === 'string' ? token : token.text); },
      link(token) {
        const inner = this.parser.parseInline(token.tokens);
        return '<a href="' + escapeHtml(safeHref(token.href)) + '" rel="noopener noreferrer">' + inner + '</a>';
      },
      image(token) { return escapeHtml(token.text || ''); },
    },
  });
  const body = m.parse(String(text || ''), { async: false });
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
    + '<style>' + STYLE + '</style><body>' + body;
}
