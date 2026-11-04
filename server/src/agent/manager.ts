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
import { QuestionBroker, type AskAnswer } from "../tools/ask.js";
import { memoryStore } from "../tools/memory.js";
import { toolsInventoryMarkdown } from "./tools-inventory.js";
import { benchModel, isBenched, isQuotaError, pickFallback, unbenchModel } from "./failover.js";
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
- For any task that takes more than a couple of steps, call todo_write before you start. Then call todo_write again after every step, sending the whole list with the real status of each item (pending, in_progress, completed, blocked, skipped, failed, cancelled). Never leave an item in_progress when it is done. Before your final answer, call todo_write one last time so the pinned plan matches what actually happened. When the task is over and the remaining plan would only be noise, call todo_clear. This is not optional bookkeeping: the student watches that list to see what you are doing.
- The server has a set of document, PDF and OCR tools already installed. They are listed below. Use them first through bash; do not install a replacement unless the listed tool is missing, it fails with an error, or the student asks for something else. If you do install something, keep it to one command and say what you installed.
- Long-term memory: only write to the memory tool when the student explicitly asks you to remember, change or forget something. Never save an inferred fact. Use memory with action list before updating or deleting, so you target the right id. Do not use it as a scratchpad.
- You can write files and run bash inside the session workspace. When you make a deliverable (PDF, slide deck, worksheet, diagram, script, study notes), save it in the workspace root with a clear filename, run what you need to verify it, then call share_file with its path so the student gets a download card. Keep the prose short: say what it is, then share it.
- The student sees a Files panel with everything in the workspace, and an automatic list of the files you created or changed in each run. Do not paste a whole file into chat when the student can download it.
- When you need a decision or want to check understanding, use ask_student with one to six multiple-choice questions. It waits for the student and returns their answers. Use it when the student asks to be quizzed, when their level or goal is unclear, or before a task where the wrong format would waste their time. Do not use it for every little thing: one good question beats five.
- Never claim a file or command worked unless the tool result confirms it. If a command fails, read the error and try another approach.
- If the student has not named their level, assume a motivated secondary school or early university student.`;

async function buildLoader(cwd: string): Promise<DefaultResourceLoader> {
  const [inventory, memories] = await Promise.all([
    toolsInventoryMarkdown(),
    Promise.resolve(memoryStore.toText()),
  ]);
  const sections = [TUTOR_INSTRUCTIONS];
  if (inventory) sections.push(inventory);
  if (memories) {
    sections.push(
      [
        "## What you remember about the student",
        "",
        "These are long-term facts the student asked you to keep. Use them naturally; do not recite the list unless asked.",
        "",
        memories,
      ].join("\n"),
    );
  }
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: paths.agentDir,
    appendSystemPromptOverride: (base) => [...base, ...sections],
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

/** One item of the plan, as the server needs it for the finish-the-plan nudge. */
export interface TodoSnapshotItem {
  content: string;
  status: string;
}

/** Read the todo list out of a `todo_write` call, tolerating a JSON-string arg. */
function todosFromArgs(args: unknown): TodoSnapshotItem[] | null {
  let value: unknown = args;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const list = (value as { todos?: unknown }).todos ?? (value as { items?: unknown }).items;
  if (!Array.isArray(list)) return null;
  return list.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { content?: unknown; title?: unknown; status?: unknown };
    const content =
      typeof item.content === "string"
        ? item.content
        : typeof item.title === "string"
          ? item.title
          : "";
    if (!content) return [];
    return [{ content, status: typeof item.status === "string" ? item.status : "pending" }];
  });
}

export class TutorSession {
  readonly meta: SessionMeta;
  private session: AgentSession;
  private subscribers = new Set<(event: unknown) => void>();
  private unsubscribe: () => void;
  private busy = false;
  /** Questions this run is waiting on, keyed by tool call id. */
  private readonly questions: QuestionBroker;
  /** When the current prompt started, used to find the files it produced. */
  private runStartedAt: number | null = null;
  /** Text of the turn in flight, so a quota failover can replay it on another model. */
  private lastPromptText = "";
  /** A quota error we swallowed, waiting to be retried on another model when the run settles. */
  private quotaError: string | null = null;
  /** One failover per turn. A second quota error just surfaces. */
  private failoverTried = false;
  /** The latest plan written this turn, used to nudge the agent to finish it. */
  private turnTodos: TodoSnapshotItem[] | null = null;
  /** One todo nudge per turn, so a stubborn list cannot loop. */
  private todoNudged = false;
  /** True while the hidden todo-reconciliation turn is running. */
  private nudging = false;

  private constructor(meta: SessionMeta, session: AgentSession, questions: QuestionBroker) {
    this.meta = meta;
    this.session = session;
    this.questions = questions;
    this.unsubscribe = session.subscribe((event) => {
      // Track the plan as the agent writes it, so the settle handler knows whether
      // anything is still unfinished. todo_clear removes it.
      if (event.type === "tool_execution_start") {
        const raw = event as unknown as { toolName?: string; args?: unknown };
        if (raw.toolName === "todo_write") this.turnTodos = todosFromArgs(raw.args);
        else if (raw.toolName === "todo_clear") this.turnTodos = [];
      }
      // A quota error ends the turn before any answer. Hold it back: the settle handler switches
      // to another free model and replays the turn, so the student never sees a dead end.
      if (event.type === "message_end") {
        const message = (event as unknown as { message?: { role?: string; stopReason?: string; errorMessage?: string } }).message;
        if (
          !this.failoverTried &&
          message?.role === "assistant" &&
          message.stopReason === "error" &&
          typeof message.errorMessage === "string" &&
          isQuotaError(message.errorMessage)
        ) {
          this.quotaError = message.errorMessage;
          return;
        }
      }
      // List the run's files before the client hears that the run settled, so the
      // artifacts card lands inside the assistant message it belongs to.
      if (event.type === "agent_settled") {
        const aborted = Boolean((event as unknown as { aborted?: boolean }).aborted);
        if (this.quotaError) {
          void (async () => {
            if (await this.failover()) {
              this.publish(toWireEvent(event));
              return;
            }
            await this.emitArtifacts();
            this.publish(toWireEvent(event));
            // No other model to move to: now the error is honest.
            this.publish({ type: "error", message: this.quotaError });
            this.quotaError = null;
          })();
          return;
        }
        const shouldNudge = !aborted && !this.todoNudged && this.hasUnfinishedTodos();
        if (shouldNudge) this.nudging = true;
        void (async () => {
          await this.emitArtifacts();
          this.publish(toWireEvent(event));
          if (shouldNudge) this.runTodoNudge();
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

  /** True when this turn's plan still has work marked pending or in progress. */
  private hasUnfinishedTodos(): boolean {
    const todos = this.turnTodos;
    if (!todos?.length) return false;
    return todos.some(
      (item) => item.status === "pending" || item.status === "in_progress",
    );
  }

  /**
   * The model often plans with todo_write and then forgets to close the items it
   * finished. When a run settles with work still marked pending or in_progress,
   * send one hidden reminder and let it reconcile the list in a short follow-up
   * turn. The reminder is a custom message (role "custom"), so it never shows up
   * as a student turn in the app or the transcript.
   */
  private runTodoNudge(): void {
    const todos = this.turnTodos;
    if (!todos?.length) {
      this.nudging = false;
      return;
    }
    this.todoNudged = true;

    const lines = todos
      .map((item) => `- [${item.status}] ${item.content}`)
      .join("\n");
    const reminder = [
      "Your plan still has unfinished items:",
      lines,
      "",
      "Before you finish, call todo_write one more time with the whole list and the real final status of every item. If the plan is complete and no longer useful, call todo_clear instead. Then give the student one short line about the outcome. Do not repeat the work and do not mention this reminder.",
    ].join("\n");

    void (async () => {
      this.busy = true;
      this.runStartedAt = Date.now();
      try {
        await this.session.sendCustomMessage(
          { customType: "mentor:todos", content: reminder, display: false },
          { triggerTurn: true },
        );
      } catch {
        // bookkeeping must never surface as a failed turn
      } finally {
        this.busy = false;
        this.nudging = false;
        this.meta.updatedAt = Date.now();
      }
    })();
  }

  static async create(meta: SessionMeta, seed: SeedMessage[] = []): Promise<TutorSession> {
    const model = meta.model ? await resolveModelRef(meta.model) : undefined;
    const manager = SessionManager.create(meta.cwd, paths.sessions);
    appendSeed(manager, seed, meta.model);
    const questions = new QuestionBroker();
    const { session } = await createAgentSession({
      cwd: meta.cwd,
      agentDir: paths.agentDir,
      sessionManager: manager,
      model,
      thinkingLevel: meta.thinkingLevel,
      resourceLoader: await buildLoader(meta.cwd),
      customTools: buildTools(meta.cwd, questions),
    });
    meta.file = manager.getSessionFile();
    if (model) meta.model = modelRef(model);
    return new TutorSession(meta, session, questions);
  }

  static async open(meta: SessionMeta): Promise<TutorSession> {
    const model = meta.model ? await resolveModelRef(meta.model) : undefined;
    const manager = meta.file
      ? SessionManager.open(meta.file, paths.sessions, meta.cwd)
      : SessionManager.create(meta.cwd, paths.sessions);
    const questions = new QuestionBroker();
    const { session } = await createAgentSession({
      cwd: meta.cwd,
      agentDir: paths.agentDir,
      sessionManager: manager,
      model,
      thinkingLevel: meta.thinkingLevel,
      resourceLoader: await buildLoader(meta.cwd),
      customTools: buildTools(meta.cwd, questions),
    });
    return new TutorSession(meta, session, questions);
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  snapshot(): { meta: SessionMeta; messages: unknown; busy: boolean } {
    return { meta: this.meta, messages: this.session.messages, busy: this.busy || this.nudging };
  }

  async prompt(text: string): Promise<unknown> {
    if (this.busy || this.nudging) return this.session.followUp(text);
    this.busy = true;
    this.lastPromptText = text;
    this.failoverTried = false;
    this.quotaError = null;
    this.turnTodos = null;
    this.todoNudged = false;
    await this.preflightModel();
    return this.run(text);
  }

  /** One turn: no busy flip, so a failover can replay it while the session stays busy. */
  private run(text: string): Promise<unknown> {
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

  /**
   * Skip a model whose quota is known to be out, before the request fails. The student picked it
   * earlier, so switching quietly is better than a guaranteed error.
   */
  private async preflightModel(): Promise<void> {
    const from = this.meta.model;
    if (!from || !isBenched(from)) return;
    const next = await pickFallback(from);
    if (!next) return;
    const model = await resolveModelRef(next);
    if (!model) return;
    await this.session.setModel(model);
    this.meta.model = modelRef(model);
    this.meta.updatedAt = Date.now();
    this.publish({ type: "model_switch", from, to: this.meta.model, reason: "quota" });
  }

  /**
   * Move the session leaf back to just before the last student turn, so the replay adds one user
   * message instead of a second copy of the same one. Returns false when the turn has no parent,
   * for example the first message of a brand new chat.
   */
  private async rewindLastUserTurn(): Promise<boolean> {
    try {
      const file = this.meta.file;
      if (!file || !existsSync(file)) return false;
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      let parentId: string | null | undefined;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const entry = JSON.parse(lines[i] ?? "{}") as {
          type?: string;
          parentId?: string | null;
          message?: { role?: string };
        };
        if (entry.type === "message" && entry.message?.role === "user") {
          parentId = entry.parentId;
          break;
        }
      }
      if (!parentId) return false;
      await this.session.navigateTree(parentId, { summarize: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The current model ran out of quota. Bench it, switch to the best configured free model and
   * replay the turn. Returns false when there is nowhere to go.
   */
  private async failover(): Promise<boolean> {
    const from = this.meta.model;
    if (!from) return false;
    const next = await pickFallback(from);
    if (!next) return false;
    const model = await resolveModelRef(next);
    if (!model) return false;

    this.failoverTried = true;
    benchModel(from);
    await this.session.setModel(model);
    this.meta.model = modelRef(model);
    this.meta.updatedAt = Date.now();
    this.quotaError = null;
    this.publish({ type: "model_switch", from, to: this.meta.model, reason: "quota" });
    // Drop the failed half of the turn so the replay is one clean user message.
    await this.rewindLastUserTurn();
    // The SDK defers a prompt sent during settle, so this runs right after the failed run closes.
    void this.run(this.lastPromptText);
    return true;
  }

  /** Deliver the student's answers to a waiting ask_student call. */
  answerQuestions(toolCallId: string, answers: AskAnswer[]): boolean {
    return this.questions.answer(toolCallId, answers);
  }

  async abort(): Promise<void> {
    this.questions.cancel();
    await this.session.abort();
  }

  async setModel(ref: string): Promise<void> {
    const model = await resolveModelRef(ref);
    if (!model) throw new Error(`Unknown model: ${ref}`);
    await this.session.setModel(model);
    this.meta.model = modelRef(model);
    this.meta.updatedAt = Date.now();
    // Picking a model is a deliberate fresh start, so lift any quota bench on it.
    unbenchModel(ref);
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.session.setThinkingLevel(level);
    this.meta.thinkingLevel = level;
    this.meta.updatedAt = Date.now();
  }

  dispose(): void {
    this.questions.cancel();
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
