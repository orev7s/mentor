import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDirs, paths } from "../config.js";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** One long-term fact about the student. Ids are stable so update and delete can target them. */
export interface Memory {
  id: string;
  content: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

function readMemories(): Memory[] {
  if (!existsSync(paths.memories)) return [];
  try {
    const raw = JSON.parse(readFileSync(paths.memories, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is Memory =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Memory).id === "string" &&
        typeof (item as Memory).content === "string",
    );
  } catch {
    return [];
  }
}

function writeMemories(items: Memory[]): void {
  ensureDirs();
  writeFileSync(paths.memories, JSON.stringify(items, null, 2) + "\n", "utf8");
}

/**
 * The student's long-term memory, one JSON file in the data dir and therefore
 * shared by every chat. The agent reads it through the `memory` tool and the
 * system prompt gets a copy, so a fact saved in one chat is known in the next.
 */
export class MemoryStore {
  list(): Memory[] {
    return readMemories();
  }

  save(content: string, category?: string): Memory {
    const items = readMemories();
    const now = Date.now();
    const memory: Memory = {
      id: randomUUID().slice(0, 8),
      content: content.trim(),
      category: category?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    items.push(memory);
    writeMemories(items);
    return memory;
  }

  update(id: string, input: { content?: string; category?: string }): Memory | null {
    const items = readMemories();
    const memory = items.find((item) => item.id === id);
    if (!memory) return null;
    if (input.content !== undefined) memory.content = input.content.trim();
    if (input.category !== undefined) memory.category = input.category.trim() || undefined;
    memory.updatedAt = Date.now();
    writeMemories(items);
    return memory;
  }

  delete(id: string): Memory | null {
    const items = readMemories();
    const memory = items.find((item) => item.id === id);
    if (!memory) return null;
    writeMemories(items.filter((item) => item.id !== id));
    return memory;
  }

  /** One line per memory, for the system prompt and the list action. */
  toText(): string {
    const items = readMemories();
    if (!items.length) return "";
    return items
      .map((item) => `- [${item.id}]${item.category ? ` (${item.category})` : ""} ${item.content}`)
      .join("\n");
  }
}

export const memoryStore = new MemoryStore();

const ACTION = Type.Union([
  Type.Literal("save"),
  Type.Literal("update"),
  Type.Literal("delete"),
  Type.Literal("list"),
]);

/**
 * One tool for the student's long-term memory. The description is the policy:
 * the agent only writes, changes or forgets something the student explicitly
 * asked it to, never anything it inferred.
 */
export function buildMemoryTool(store: MemoryStore) {
  return defineTool({
    name: "memory",
    label: "Memory",
    description:
      "Store and manage long-term facts about the student, shared across all their chats. ONLY use this when the student explicitly asks: 'remember that ...', 'save this', 'forget ...', 'what do you remember about me?'. Never save something the student did not ask you to keep, and never invent a memory. Actions: save (add: content, optional category), update (change: id plus new content/category), delete (forget: id), list (return everything). Use list before update or delete so you have the right id.",
    parameters: Type.Object({
      action: ACTION,
      id: Type.Optional(
        Type.String({ description: "Memory id, from list. Required for update and delete." }),
      ),
      content: Type.Optional(
        Type.String({ description: "The fact, in one short sentence. Required for save." }),
      ),
      category: Type.Optional(
        Type.String({ description: "Optional grouping, e.g. 'goal', 'course', 'preference'." }),
      ),
    }),
    execute: async (
      _id: string,
      params: { action: string; id?: string; content?: string; category?: string },
    ): Promise<{
      content: { type: "text"; text: string }[];
      details: { memories?: Memory[]; memory?: Memory };
    }> => {
      switch (params.action) {
        case "list": {
          const text = store.toText();
          return {
            content: [{ type: "text" as const, text: text || "No memories saved." }],
            details: { memories: store.list() },
          };
        }
        case "save": {
          if (!params.content?.trim()) throw new Error("content is required to save a memory");
          const memory = store.save(params.content, params.category);
          return {
            content: [
              {
                type: "text" as const,
                text: `Saved memory [${memory.id}]: ${memory.content}`,
              },
            ],
            details: { memory },
          };
        }
        case "update": {
          if (!params.id) throw new Error("id is required to update a memory");
          const memory = store.update(params.id, {
            content: params.content,
            category: params.category,
          });
          if (!memory) throw new Error(`No memory with id ${params.id}`);
          return {
            content: [
              { type: "text" as const, text: `Updated memory [${memory.id}]: ${memory.content}` },
            ],
            details: { memory },
          };
        }
        case "delete": {
          if (!params.id) throw new Error("id is required to delete a memory");
          const memory = store.delete(params.id);
          if (!memory) throw new Error(`No memory with id ${params.id}`);
          return {
            content: [{ type: "text" as const, text: `Forgot memory [${memory.id}].` }],
            details: { memory },
          };
        }
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    },
  });
}
