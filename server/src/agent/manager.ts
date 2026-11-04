import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { ensureDirs, paths } from "../config.js";
import { listWorkspaceFiles } from "../files.js";
import { buildTools } from "../tools/index.js";
import { modelRef, resolveModelRef } from "./runtime.js";

/**
 * Appended to Pi's default coding-agent prompt. The default prompt already
 * explains read, write, edit and bash; this makes the agent a tutor and tells
 * it how the student sees its work.
 */
const TUTOR_INSTRUCTIONS = `## Role: Mentor

You are Mentor, a patient one-on-one tutor for a single student. Teach the way a good tutor does: find out what they already know, explain in small steps, and check understanding before moving on. Prefer a short answer plus one concrete example over a wall of text.

- Write Markdown. Use $...$ or $$...$$ for math.
- When the student shares a file, read it with read_document (PDF, DOCX, HTML, text) or ocr_image (photos and scans) before answering.
- Use web_search and web_fetch for facts that may have changed, and cite the URLs you used.
- For any task that takes more than a couple of steps, call todo_write first, then update it as you work. The student sees the plan live above the composer.
- You can write files and run bash inside the session workspace. When you make a deliverable (PDF, slide deck, worksheet, diagram, script, study notes), save it in the workspace root with a clear filename, run what you need to verify it, then call share_file with its path so the student gets a download card. Keep the prose short: say what it is, then share it.
- The student sees a Files panel with everything in the workspace, and an automatic list of the files you created or changed in each run. Do not paste a whole file into chat when the student can download it.
- Never claim a file or command worked unless the tool result confirms it. If a command fails, read the error and try another approach.
- If the student has not named their level, assume a motivated secondary school or early university student.`;

async function buildLoader(cwd: string): Promise<DefaultResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: paths.agentDir,
    appendSystemPromptOverride: (base) => [...base, TUTOR_INSTRUCTIONS],
  });
  await loader.reload();
  return loader;
}

export interface SessionMeta {
  id: string;
  title: string;
  /** "provider/modelId" the user picked, if any. */
  model?: string;
  thinkingLevel: ThinkingLevel;
  cwd: string;
  /** Pi JSONL session file, used to resume. */
  file?: string;
  /** Session this one was forked from, if any. */
  parent?: string;
  createdAt: number;
  updatedAt: number;
}

/** Prior turns replayed into a fresh session when forking. Text only. */
export interface SeedMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * Replay a conversation into a new session before the first prompt. The student
 * forks from a point in a chat, so the new session keeps the earlier turns as
 * context. Tool calls are left out on purpose: a lone tool call with no matching
 * result would make providers reject the request.
 */
function appendSeed(manager: SessionManager, seed: SeedMessage[], model?: string): void {
  if (!seed.length) return;
  const now = Date.now();
  const [provider = "openrouter", ...modelParts] = (model ?? "").split("/");
  for (const item of seed) {
    const text = item.text.trim();
    if (!text) continue;
    if (item.role === "user") {
      manager.appendMessage({ role: "user", content: text, timestamp: now });
      continue;
    }
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text }],
      api: "openai-completions",
      provider,
      model: modelParts.join("/") || "unknown",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: now,
    } as unknown as Parameters<SessionManager["appendMessage"]>[0]);
  }
}

/** Trim the SDK event stream to what the phone UI needs. */
function toWireEvent(event: AgentSessionEvent): unknown {
  const raw = event as unknown as Record<string, unknown>;
  switch (event.type) {
    case "message_update": {
      const inner = raw.assistantMessageEvent as Record<string, unknown> | undefined;
      return {
        type: "message_update",
        usage: raw.usage,
        event: inner?.type,
        contentIndex: inner?.contentIndex,
        delta: inner?.delta,
        toolCall: inner?.toolCall,
      };
    }
    case "message_start":
    case "message_end":
      return { type: event.type, message: raw.message };
    case "tool_execution_start":
      return {
        type: event.type,
        toolCallId: raw.toolCallId,
        toolName: raw.toolName,
        args: raw.args,
      };
    case "tool_execution_end":
      return {
        type: event.type,
        toolCallId: raw.toolCallId,
        toolName: raw.toolName,
        isError: raw.isError,
        durationMs: raw.durationMs,
        result: raw.result,
      };
    case "turn_end":
      return { type: event.type, message: raw.message, toolResults: raw.toolResults };
    default:
      return { type: event.type };
  }
}

export class TutorSession {
  readonly meta: SessionMeta;
  private session: AgentSession;
  private subscribers = new Set<(event: unknown) => void>();
  private unsubscribe: () => void;
  private busy = false;
  /** When the current prompt started, used to find the files it produced. */
  private runStartedAt: number | null = null;

  private constructor(meta: SessionMeta, session: AgentSession) {
    this.meta = meta;
    this.session = session;
    this.unsubscribe = session.subscribe((event) => {
      // List the run's files before the client hears that the run settled, so the
      // artifacts card lands inside the assistant message it belongs to.
      if (event.type === "agent_settled") {
        void (async () => {
          await this.emitArtifacts();
          this.publish(toWireEvent(event));
        })();
        return;
      }
      this.publish(toWireEvent(event));
    });
  }

  private publish(event: unknown): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        // a broken subscriber must not stop the run
      }
    }
  }

  private async emitArtifacts(): Promise<void> {
    const startedAt = this.runStartedAt;
    this.runStartedAt = null;
    if (!startedAt) return;
    try {
      const files = (await listWorkspaceFiles(this.meta.cwd))
        .filter((file) => !file.path.startsWith("uploads/") && file.mtime >= startedAt - 1500)
        .sort((a, b) => b.mtime - a.mtime);
      if (!files.length) return;
      this.publish({ type: "artifacts", files, startedAt, endedAt: Date.now() });
    } catch {
      // a failed listing must not stop the run
    }
  }

  static async create(meta: SessionMeta, seed: SeedMessage[] = []): Promise<TutorSession> {
    const model = meta.model ? await resolveModelRef(meta.model) : undefined;
    const manager = SessionManager.create(meta.cwd, paths.sessions);
    appendSeed(manager, seed, meta.model);
    const { session } = await createAgentSession({
      cwd: meta.cwd,
      agentDir: paths.agentDir,
      sessionManager: manager,
      model,
      thinkingLevel: meta.thinkingLevel,
      resourceLoader: await buildLoader(meta.cwd),
      customTools: buildTools(meta.cwd),
    });
    meta.file = manager.getSessionFile();
    if (model) meta.model = modelRef(model);
    return new TutorSession(meta, session);
  }

  static async open(meta: SessionMeta): Promise<TutorSession> {
    const model = meta.model ? await resolveModelRef(meta.model) : undefined;
    const manager = meta.file
      ? SessionManager.open(meta.file, paths.sessions, meta.cwd)
      : SessionManager.create(meta.cwd, paths.sessions);
    const { session } = await createAgentSession({
      cwd: meta.cwd,
      agentDir: paths.agentDir,
      sessionManager: manager,
      model,
      thinkingLevel: meta.thinkingLevel,
      resourceLoader: await buildLoader(meta.cwd),
      customTools: buildTools(meta.cwd),
    });
    return new TutorSession(meta, session);
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  snapshot(): { meta: SessionMeta; messages: unknown } {
    return { meta: this.meta, messages: this.session.messages };
  }

  prompt(text: string): Promise<unknown> {
    if (this.busy) return this.session.followUp(text);
    this.busy = true;
    this.runStartedAt = Date.now();
    return this.session
      .prompt(text)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.publish({ type: "error", message });
      })
      .finally(() => {
        this.busy = false;
        this.meta.updatedAt = Date.now();
      });
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async setModel(ref: string): Promise<void> {
    const model = await resolveModelRef(ref);
    if (!model) throw new Error(`Unknown model: ${ref}`);
    await this.session.setModel(model);
    this.meta.model = modelRef(model);
    this.meta.updatedAt = Date.now();
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.session.setThinkingLevel(level);
    this.meta.thinkingLevel = level;
    this.meta.updatedAt = Date.now();
  }

  dispose(): void {
    this.unsubscribe();
    this.session.dispose();
  }
}

export class AgentManager {
  private active = new Map<string, TutorSession>();
  private index: SessionMeta[] = [];

  constructor() {
    this.loadIndex();
  }

  private loadIndex(): void {
    ensureDirs();
    if (!existsSync(paths.sessionIndex)) return;
    try {
      this.index = JSON.parse(readFileSync(paths.sessionIndex, "utf8")) as SessionMeta[];
    } catch {
      this.index = [];
    }
  }

  private saveIndex(): void {
    ensureDirs();
    writeFileSync(paths.sessionIndex, JSON.stringify(this.index, null, 2) + "\n", "utf8");
  }

  list(): SessionMeta[] {
    return [...this.index].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  rename(id: string, title: string): void {
    const meta = this.index.find((entry) => entry.id === id);
    if (!meta) return;
    meta.title = title;
    this.saveIndex();
  }

  async update(
    id: string,
    input: { model?: string; thinkingLevel?: ThinkingLevel },
  ): Promise<SessionMeta> {
    const session = await this.get(id);
    if (input.model) await session.setModel(input.model);
    if (input.thinkingLevel) session.setThinkingLevel(input.thinkingLevel);
    const meta = this.index.find((entry) => entry.id === id);
    if (!meta) throw new Error(`Unknown session: ${id}`);
    meta.model = session.meta.model;
    meta.thinkingLevel = session.meta.thinkingLevel;
    meta.updatedAt = Date.now();
    this.saveIndex();
    return meta;
  }

  async get(id: string): Promise<TutorSession> {
    const existing = this.active.get(id);
    if (existing) return existing;
    const meta = this.index.find((entry) => entry.id === id);
    if (!meta) throw new Error(`Unknown session: ${id}`);
    const session = await TutorSession.open(meta);
    this.active.set(id, session);
    return session;
  }

  async create(input: {
    model?: string;
    thinkingLevel?: ThinkingLevel;
    title?: string;
    parent?: string;
    seed?: SeedMessage[];
  }): Promise<TutorSession> {
    ensureDirs();
    const id = randomUUID();
    const cwd = join(paths.workspaces, id);
    mkdirSync(cwd, { recursive: true });
    const now = Date.now();
    const meta: SessionMeta = {
      id,
      title: input.title ?? "New chat",
      model: input.model,
      thinkingLevel: input.thinkingLevel ?? "medium",
      cwd,
      parent: input.parent,
      createdAt: now,
      updatedAt: now,
    };
    const session = await TutorSession.create(meta, input.seed ?? []);
    this.active.set(id, session);
    this.index.push(meta);
    this.saveIndex();
    return session;
  }

  async delete(id: string): Promise<void> {
    const active = this.active.get(id);
    if (active) {
      active.dispose();
      this.active.delete(id);
    }
    const meta = this.index.find((entry) => entry.id === id);
    if (meta) {
      rmSync(meta.cwd, { recursive: true, force: true });
      if (meta.file) rmSync(meta.file, { force: true });
    }
    this.index = this.index.filter((entry) => entry.id !== id);
    this.saveIndex();
  }
}
