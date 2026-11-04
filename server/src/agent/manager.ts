import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  SessionManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { ensureDirs, paths } from "../config.js";
import { buildTools } from "../tools/index.js";
import { modelRef, resolveModelRef } from "./runtime.js";

export interface SessionMeta {
  id: string;
  title: string;
  /** "provider/modelId" the user picked, if any. */
  model?: string;
  thinkingLevel: ThinkingLevel;
  cwd: string;
  /** Pi JSONL session file, used to resume. */
  file?: string;
  createdAt: number;
  updatedAt: number;
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

  private constructor(meta: SessionMeta, session: AgentSession) {
    this.meta = meta;
    this.session = session;
    this.unsubscribe = session.subscribe((event) => {
      const wire = toWireEvent(event);
      for (const subscriber of this.subscribers) {
        try {
          subscriber(wire);
        } catch {
          // a broken subscriber must not stop the run
        }
      }
    });
  }

  static async create(meta: SessionMeta): Promise<TutorSession> {
    const model = meta.model ? await resolveModelRef(meta.model) : undefined;
    const manager = SessionManager.create(meta.cwd, paths.sessions);
    const { session } = await createAgentSession({
      cwd: meta.cwd,
      agentDir: paths.agentDir,
      sessionManager: manager,
      model,
      thinkingLevel: meta.thinkingLevel,
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
    return this.session
      .prompt(text)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        for (const subscriber of this.subscribers) subscriber({ type: "error", message });
      })
      .finally(() => {
        this.busy = false;
        this.meta.updatedAt = Date.now();
      });
  }

  async abort(): Promise<void> {
    await this.session.abort();
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
      createdAt: now,
      updatedAt: now,
    };
    const session = await TutorSession.create(meta);
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
