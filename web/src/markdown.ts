import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";

marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface CodeToken {
  text?: string;
  lang?: string;
  raw?: string;
}

marked.use({
  renderer: {
    code(token: CodeToken | string): string {
      const raw = typeof token === "string" ? token : token.text ?? token.raw ?? "";
      const lang = typeof token === "string" ? "" : (token.lang ?? "").split(/\s+/)[0];
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(raw, { language: lang }).value;
        } catch {
          highlighted = escapeHtml(raw);
        }
      } else {
        highlighted = hljs.highlightAuto(raw).value;
      }
      const label = lang || "text";
      return `<div class="code-card"><div class="code-head"><span>${label}</span><button class="code-copy" type="button" data-copy="${encodeURIComponent(raw)}">Copy</button></div><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
  },
});

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-copy", "target"] });
}