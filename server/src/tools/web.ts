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

/** Prefer Exa when a key is set; fall back to keyless Bing HTML scraping. */
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
  const bing = await bingSearch(query, limit);
  if (bing.length) return bing;
  return duckDuckGo(query, limit);
}

/**
 * Bing still serves clean HTML without an API key. DuckDuckGo's HTML endpoint
 * now answers with a 202 challenge page, so it stays as a last resort only.
 */
async function bingSearch(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.split(/<li class="b_algo"/i).slice(1);
  for (const block of blocks) {
    if (results.length >= limit) break;
    const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    const url = decodeBingUrl(decodeHtml(link[1]));
    const title = stripTags(link[2]);
    if (!url || !title) continue;
    const snippetMatch =
      /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
      /<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
      /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    results.push({
      title,
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
    });
  }
  return results;
}

/** Bing wraps results in `/ck/a?...&u=a1<base64url>`; unwrap the real URL. */
function decodeBingUrl(url: string): string {
  const match = /[?&]u=a1([^&]+)/.exec(url);
  if (!match) return url;
  try {
    const base64 = decodeURIComponent(match[1]).replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return url;
  }
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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
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
