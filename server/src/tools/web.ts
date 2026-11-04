import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import TurndownService from "turndown";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) MentorBot/0.1 Safari/537.36";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Prefer Exa when a key is set; fall back to keyless DuckDuckGo HTML scraping. */
async function search(query: string, limit: number): Promise<SearchResult[]> {
  const exaKey = process.env.EXA_API_KEY;
  if (exaKey) {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": exaKey },
      body: JSON.stringify({
        query,
        numResults: limit,
        contents: { text: { maxCharacters: 1000 } },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { title?: string; url?: string; text?: string }[];
      };
      return (data.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: (r.text ?? "").slice(0, 500),
      }));
    }
  }
  return duckDuckGo(query, limit);
}

async function duckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: query }).toString(),
  });
  const html = await res.text();
  const results: SearchResult[] = [];
  const linkRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  for (let m = snippetRe.exec(html); m; m = snippetRe.exec(html)) {
    snippets.push(stripTags(m[1]));
  }
  let i = 0;
  for (let m = linkRe.exec(html); m && results.length < limit; m = linkRe.exec(html)) {
    let url = decodeHtml(m[1]);
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    results.push({ title: stripTags(m[2]), url, snippet: snippets[i] ?? "" });
    i += 1;
  }
  return results;
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function buildWebTools() {
  const webFetch = defineTool({
    name: "web_fetch",
    label: "Web fetch",
    description:
      "Fetch a URL and return its readable content as markdown or plain text. Use for reading a specific page found via web_search.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL" }),
      maxChars: Type.Optional(Type.Number({ description: "Truncate to this many characters" })),
    }),
    execute: async (_id: string, params: { url: string; maxChars?: number }) => {
      const res = await fetch(params.url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
      });
      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      const title = contentType.includes("html")
        ? /<title[^>]*>([\s\S]*?)<\/title>/i
            .exec(body)?.[1]
            ?.replace(/\s+/g, " ")
            .trim()
        : undefined;
      let text = body;
      if (contentType.includes("html")) {
        const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
        turndown.remove(["script", "style", "noscript", "nav", "footer", "header", "form", "aside"]);
        text = turndown.turndown(body);
      }
      const limit = params.maxChars ?? 20000;
      const truncated = text.length > limit;
      const excerpt = truncated ? text.slice(0, limit) : text;
      return {
        content: [
          {
            type: "text" as const,
            text: excerpt + (truncated ? "\n\n[truncated]" : ""),
          },
        ],
        details: {
          url: res.url,
          status: res.status,
          contentType,
          title,
          excerpt: excerpt.slice(0, 4000),
          chars: text.length,
          truncated,
        },
      };
    },
  });

  const webSearch = defineTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the web and return results with title, url, and snippet. Prefer official or reputable sources for schoolwork.",
    parameters: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number({ description: "Max results, default 5" })),
    }),
    execute: async (_id: string, params: { query: string; limit?: number }) => {
      const startedAt = Date.now();
      const results = await search(params.query, Math.min(params.limit ?? 5, 10));
      const text = results.length
        ? results
            .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
            .join("\n\n")
        : "No results.";
      return {
        content: [{ type: "text" as const, text }],
        details: {
          query: params.query,
          results,
          total: results.length,
          durationMs: Date.now() - startedAt,
        },
      };
    },
  });

  return [webFetch, webSearch];
}
