import { stripAttachmentNote } from "@/lib/attachments";
import type { ChatcnMessage, ChatcnTextPart, ChatcnToolPart } from "@/lib/chatcn-types";

/* -------------------------------------------------------------------------------------------------
 * Pi message -> chatcn part helpers
 * -----------------------------------------------------------------------------------------------*/

export interface PiBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

export interface PiMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
  stopReason?: string;
  errorMessage?: string;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is PiBlock => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

export function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  const content = record(result).content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is PiBlock => Boolean(block) && typeof block === "object")
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
  }
  if (result && typeof result === "object") return JSON.stringify(result, null, 2);
  return "";
}

function toolNameKey(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase();
}

/**
 * Pi returns `{ content, details }`. The chatcn renderers read structured fields, so map the
 * tool-specific details into the shape each renderer expects.
 */
export function normalizeOutput(name: string, result: unknown, isError: boolean): unknown {
  const details = record(record(result).details);
  const text = resultText(result);
  const key = toolNameKey(name);
  switch (key) {
    case "bash":
    case "shell":
    case "run_command":
      return { ...details, stdout: text, stderr: "", exitCode: isError ? 1 : 0 };
    case "web_search":
    case "search_web":
      return {
        results: Array.isArray(details.results) ? details.results : [],
        total: typeof details.total === "number" ? details.total : undefined,
        durationMs: typeof details.durationMs === "number" ? details.durationMs : undefined,
      };
    case "web_fetch": {
      const excerpt =
        typeof details.excerpt === "string" ? details.excerpt : text.slice(0, 4000);
      return {
        url: details.url,
        status: details.status,
        title: details.title,
        excerpt,
        content: excerpt,
      };
    }
    case "read":
    case "read_file":
      return text;
    case "edit":
    case "edit_file":
      return {
        ...details,
        diff: details.patch ?? details.diff,
      };
    case "write":
    case "write_file":
      return { ...details, ok: !isError };
    default:
      return { ...details, text };
  }
}

export function isTerminal(part: ChatcnToolPart): boolean {
  return part.state === "output-available" || part.state === "output-error";
}

/** Turn a Pi transcript into chatcn messages: one assistant bubble per user turn. */
export function messagesFromSnapshot(raw: unknown[]): ChatcnMessage[] {
  const out: ChatcnMessage[] = [];
  const toolParts = new Map<string, ChatcnToolPart>();
  let assistant: ChatcnMessage | null = null;

  raw.forEach((item, index) => {
    const message = item as PiMessage;
    if (message.role === "user") {
      assistant = null;
      out.push({
        id: `snap-u-${index}`,
        role: "user",
        parts: [{ type: "text", text: stripAttachmentNote(textFromContent(message.content)) }],
      });
      return;
    }
    if (message.role === "assistant") {
      if (!assistant) {
        assistant = { id: `snap-a-${index}`, role: "assistant", parts: [] };
        out.push(assistant);
      }
      const blocks = Array.isArray(message.content) ? (message.content as PiBlock[]) : [];
      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          assistant.parts.push({ type: "text", text: block.text, state: "done" });
        } else if (block.type === "thinking" && block.thinking) {
          assistant.parts.push({ type: "reasoning", text: block.thinking, state: "done" });
        } else if (block.type === "toolCall" && block.id && block.name) {
          const part: ChatcnToolPart = {
            type: `tool-${block.name}`,
            toolCallId: block.id,
            state: "input-available",
            input: block.arguments,
          };
          assistant.parts.push(part);
          toolParts.set(block.id, part);
        }
      }
      return;
    }
    if (message.role === "toolResult" && message.toolCallId) {
      const part = toolParts.get(message.toolCallId);
      if (!part) return;
      part.state = message.isError ? "output-error" : "output-available";
      part.output = normalizeOutput(
        message.toolName ?? part.type.slice(5),
        message,
        Boolean(message.isError),
      );
      if (message.isError) part.errorText = resultText(message);
    }
  });

  return out;
}

/** The text a forked session keeps from a turn. Tool traces are dropped on purpose. */
export function messageTextOf(message: ChatcnMessage): string {
  return message.parts
    .filter((part): part is ChatcnTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}
