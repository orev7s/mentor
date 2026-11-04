import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import TurndownService from "turndown";

/** Resolve a path and refuse anything outside the session workspace. */
function withinWorkspace(workspace: string, path: string): string {
  const root = resolve(workspace);
  const abs = resolve(root, path);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`Path is outside the workspace: ${path}`);
  }
  return abs;
}

function limitText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + "\n\n[truncated]", truncated: true };
}

export function buildDocumentTools(workspace: string) {
  const readDocument = defineTool({
    name: "read_document",
    label: "Read document",
    description:
      "Extract text from a document in the workspace. Supports PDF, DOCX, HTML, Markdown, and plain text. Use this on files the student uploaded.",
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to the workspace" }),
      maxChars: Type.Optional(Type.Number()),
    }),
    execute: async (_id: string, params: { path: string; maxChars?: number }) => {
      const abs = withinWorkspace(workspace, params.path);
      const ext = extname(abs).toLowerCase();
      let text = "";
      if (ext === ".pdf") {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const buffer = new Uint8Array(await readFile(abs));
        const pdf = await getDocumentProxy(buffer);
        const out = await extractText(pdf, { mergePages: true });
        text = Array.isArray(out.text) ? out.text.join("\n\n") : out.text;
      } else if (ext === ".docx") {
        const mammoth = (await import("mammoth")).default;
        const out = await mammoth.extractRawText({ buffer: await readFile(abs) });
        text = out.value;
      } else if (ext === ".html" || ext === ".htm") {
        const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
        text = turndown.turndown(await readFile(abs, "utf8"));
      } else {
        text = await readFile(abs, "utf8");
      }
      const limited = limitText(text, params.maxChars ?? 40000);
      return {
        content: [{ type: "text" as const, text: limited.text || "(empty document)" }],
        details: { path: abs, ext, chars: text.length, truncated: limited.truncated },
      };
    },
  });

  const ocrImage = defineTool({
    name: "ocr_image",
    label: "OCR image",
    description:
      "Run OCR on an image in the workspace (photo of notes, scanned page, screenshot) and return the recognized text.",
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to the workspace" }),
      lang: Type.Optional(Type.String({ description: "Tesseract language, default eng" })),
    }),
    execute: async (_id: string, params: { path: string; lang?: string }) => {
      const abs = withinWorkspace(workspace, params.path);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(params.lang ?? "eng");
      try {
        const { data } = await worker.recognize(abs);
        return {
          content: [{ type: "text" as const, text: data.text.trim() || "(no text found)" }],
          details: { path: abs, confidence: data.confidence },
        };
      } finally {
        await worker.terminate();
      }
    },
  });

  return [readDocument, ocrImage];
}
