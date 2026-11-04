import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatcnMessage, ChatcnPart, ChatcnToolPart } from "@/lib/chatcn-types";
import {
  ApiClient,
  modelRef,
  normaliseUrl,
  type Attachment,
  type CustomProvider,
  type ModelSummary,
  type ProviderPreset,
  type SessionMeta,
  type WorkspaceFile,
} from "@/lib/api";

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

const CONNECTION_KEY = "mentor.connection";
const PREFS_KEY = "mentor.prefs";
const ATTACHMENT_NOTE =
  "\n\nAttached files (read them with read_document, or ocr_image for photos and scans):\n";
const STARTERS = [
  "Explain photosynthesis like I'm in 8th grade",
  "Quiz me on my notes",
  "Summarize this PDF",
  "Solve a quadratic step by step",
];

/* -------------------------------------------------------------------------------------------------
 * Pi message -> chatcn part helpers
 * -----------------------------------------------------------------------------------------------*/

interface PiBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

interface PiMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
  stopReason?: string;
  errorMessage?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is PiBlock => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

function resultText(result: unknown): string {
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
function normalizeOutput(name: string, result: unknown, isError: boolean): unknown {
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

function isTerminal(part: ChatcnToolPart): boolean {
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
        parts: [{ type: "text", text: textFromContent(message.content) }],
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

/* -------------------------------------------------------------------------------------------------
 * Hook
 * -----------------------------------------------------------------------------------------------*/

interface RunState {
  assistantId: string;
  textPart: number | null;
  reasoningPart: number | null;
  tools: Map<string, number>;
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++sequence}`;

export function useMentor() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const [models, setModels] = useState<ModelSummary[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatcnMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [chatError, setChatError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const [model, setModelState] = useState<string | null>(null);
  const [thinkingLevel, setThinkingLevelState] = useState("medium");

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tokensUsed, setTokensUsed] = useState(0);

  const clientRef = useRef<ApiClient | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<ChatcnMessage[]>([]);
  const runRef = useRef<RunState | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const modelRefValue = useRef<string | null>(null);
  const levelRef = useRef("medium");
  const filesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoConnected = useRef(false);

  const publish = useCallback((next: ChatcnMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const replaceMessage = useCallback(
    (id: string, next: ChatcnMessage) => {
      publish(messagesRef.current.map((message) => (message.id === id ? next : message)));
    },
    [publish],
  );

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const savePrefs = useCallback((nextModel: string | null, nextLevel: string) => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ model: nextModel, thinkingLevel: nextLevel }),
      );
    } catch {
      // storage may be unavailable
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const api = clientRef.current;
    if (!api) return;
    try {
      const data = await api.sessions();
      setSessions(data.sessions);
    } catch {
      // keep the list we have
    }
  }, []);

  const refreshFiles = useCallback(async (id?: string) => {
    const api = clientRef.current;
    const sessionId = id ?? activeIdRef.current;
    if (!api || !sessionId) return;
    try {
      const data = await api.files(sessionId);
      if (activeIdRef.current === sessionId) setFiles(data.files);
    } catch {
      // a workspace that cannot be listed yet
    }
  }, []);

  const scheduleFiles = useCallback(() => {
    if (filesTimer.current) clearTimeout(filesTimer.current);
    filesTimer.current = setTimeout(() => void refreshFiles(), 400);
  }, [refreshFiles]);

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  /* ---------------------------------------------------------------- streaming reducer */

  const ensureAssistant = useCallback((): ChatcnMessage => {
    const current = runRef.current;
    if (current) {
      const found = messagesRef.current.find((message) => message.id === current.assistantId);
      if (found) return found;
    }
    const message: ChatcnMessage = {
      id: nextId("a"),
      role: "assistant",
      parts: [],
    };
    publish([...messagesRef.current, message]);
    runRef.current = {
      assistantId: message.id,
      textPart: null,
      reasoningPart: null,
      tools: new Map(),
    };
    return message;
  }, [publish]);

  const appendDelta = useCallback(
    (kind: "text" | "reasoning", delta: string) => {
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      let parts = message.parts;
      let index = kind === "text" ? run.textPart : run.reasoningPart;
      const existing = index === null ? undefined : parts[index];
      if (
        !existing ||
        existing.type !== kind ||
        (existing as { state?: string }).state !== "streaming"
      ) {
        index = parts.length;
        parts = [...parts, { type: kind, text: "", state: "streaming" } as ChatcnPart];
        if (kind === "text") run.textPart = index;
        else run.reasoningPart = index;
      }
      const at = index as number;
      parts = parts.map((part, i) =>
        i === at
          ? ({ ...part, text: `${(part as { text?: string }).text ?? ""}${delta}` } as ChatcnPart)
          : part,
      );
      replaceMessage(message.id, { ...message, parts });
    },
    [ensureAssistant, replaceMessage],
  );

  const finishBlock = useCallback(
    (kind: "text" | "reasoning", text: string) => {
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const index = kind === "text" ? run.textPart : run.reasoningPart;
      const existing = index === null ? undefined : message.parts[index];
      if (
        existing &&
        existing.type === kind &&
        (existing as { state?: string }).state === "streaming"
      ) {
        replaceMessage(message.id, {
          ...message,
          parts: message.parts.map((part, i) =>
            i === index ? ({ ...part, text, state: "done" } as ChatcnPart) : part,
          ),
        });
      } else if (text) {
        replaceMessage(message.id, {
          ...message,
          parts: [...message.parts, { type: kind, text, state: "done" } as ChatcnPart],
        });
      }
      if (kind === "text") run.textPart = null;
      else run.reasoningPart = null;
    },
    [ensureAssistant, replaceMessage],
  );

  const upsertTool = useCallback(
    (call: { id?: string; name?: string; arguments?: unknown }) => {
      if (!call.id || !call.name) return;
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const index = run.tools.get(call.id);
      if (index !== undefined) {
        const existing = message.parts[index] as ChatcnToolPart;
        const next: ChatcnToolPart = {
          ...existing,
          type: `tool-${call.name}`,
          input: call.arguments ?? existing.input,
          state: isTerminal(existing) ? existing.state : "input-available",
        };
        replaceMessage(message.id, {
          ...message,
          parts: message.parts.map((part, i) => (i === index ? next : part)),
        });
        return;
      }
      const part: ChatcnToolPart = {
        type: `tool-${call.name}`,
        toolCallId: call.id,
        state: "input-available",
        input: call.arguments ?? {},
      };
      run.tools.set(call.id, message.parts.length);
      replaceMessage(message.id, { ...message, parts: [...message.parts, part] });
    },
    [ensureAssistant, replaceMessage],
  );

  const settleTool = useCallback(
    (event: Record<string, unknown>) => {
      const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
      if (!id) return;
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const name = typeof event.toolName === "string" ? event.toolName : "tool";
      const isError = Boolean(event.isError);
      const output = normalizeOutput(name, event.result, isError);
      const index = run.tools.get(id);
      if (index !== undefined) {
        const existing = message.parts[index] as ChatcnToolPart;
        const next: ChatcnToolPart = {
          ...existing,
          state: isError ? "output-error" : "output-available",
          output,
          errorText: isError ? resultText(event.result) : undefined,
        };
        replaceMessage(message.id, {
          ...message,
          parts: message.parts.map((part, i) => (i === index ? next : part)),
        });
      } else {
        const part: ChatcnToolPart = {
          type: `tool-${name}`,
          toolCallId: id,
          state: isError ? "output-error" : "output-available",
          input: event.args ?? {},
          output,
          errorText: isError ? resultText(event.result) : undefined,
        };
        run.tools.set(id, message.parts.length);
        replaceMessage(message.id, { ...message, parts: [...message.parts, part] });
      }
      scheduleFiles();
    },
    [ensureAssistant, replaceMessage, scheduleFiles],
  );

  const applyEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = event.type;
      if (type === "message_start") {
        const message = event.message as PiMessage | undefined;
        if (message?.role === "user") {
          const last = messagesRef.current[messagesRef.current.length - 1];
          if (last?.role === "user") return;
          publish([
            ...messagesRef.current,
            {
              id: nextId("u"),
              role: "user",
              parts: [{ type: "text", text: textFromContent(message.content) }],
            },
          ]);
          return;
        }
        if (message?.role === "assistant") {
          const run = runRef.current;
          if (run) {
            run.textPart = null;
            run.reasoningPart = null;
          }
          setStatus("streaming");
        }
        return;
      }

      if (type === "message_update") {
        setStatus("streaming");
        const usage = record(event.usage);
        if (typeof usage.totalTokens === "number") setTokensUsed(usage.totalTokens);
        const inner = typeof event.event === "string" ? event.event : "";
        const delta = typeof event.delta === "string" ? event.delta : "";
        if (inner === "text_delta" && delta) appendDelta("text", delta);
        else if (inner === "thinking_delta" && delta) appendDelta("reasoning", delta);
        else if (inner === "toolcall_end" && event.toolCall) {
          const call = event.toolCall as { id?: string; name?: string; arguments?: unknown };
          upsertTool(call);
        }
        return;
      }

      if (type === "message_end") {
        const message = event.message as PiMessage | undefined;
        if (message?.role !== "assistant") return;
        const usage = record((message as { usage?: unknown }).usage);
        if (typeof usage.totalTokens === "number") setTokensUsed(usage.totalTokens);
        const blocks = Array.isArray(message.content) ? (message.content as PiBlock[]) : [];
        for (const block of blocks) {
          if (block.type === "text") finishBlock("text", block.text ?? "");
          else if (block.type === "thinking") finishBlock("reasoning", block.thinking ?? "");
          else if (block.type === "toolCall")
            upsertTool({ id: block.id, name: block.name, arguments: block.arguments });
        }
        const run = runRef.current;
        if (run) {
          run.textPart = null;
          run.reasoningPart = null;
        }
        if (message.stopReason === "error" && message.errorMessage) {
          setChatError(message.errorMessage);
          setStatus("error");
        }
        return;
      }

      if (type === "tool_execution_start") {
        upsertTool({
          id: typeof event.toolCallId === "string" ? event.toolCallId : undefined,
          name: typeof event.toolName === "string" ? event.toolName : undefined,
          arguments: event.args,
        });
        setStatus("streaming");
        return;
      }

      if (type === "tool_execution_end") {
        settleTool(event);
        return;
      }

      if (type === "agent_start") {
        setStatus("streaming");
        return;
      }

      if (type === "artifacts") {
        const files = Array.isArray(event.files) ? (event.files as WorkspaceFile[]) : [];
        if (!files.length) return;
        const message = ensureAssistant();
        const parts = message.parts.filter(
          (part) =>
            !(part.type === "data-artifacts" && (part as { id?: string }).id === "artifacts"),
        );
        replaceMessage(message.id, {
          ...message,
          parts: [
            ...parts,
            { type: "data-artifacts", id: "artifacts", data: { files } },
          ],
        });
        return;
      }

      if (type === "agent_settled") {
        publish(
          messagesRef.current.map((message) =>
            message.role === "assistant"
              ? {
                  ...message,
                  parts: message.parts.map((part) =>
                    (part.type === "text" || part.type === "reasoning") &&
                    (part as { state?: string }).state === "streaming"
                      ? ({ ...part, state: "done" } as ChatcnPart)
                      : part,
                  ),
                }
              : message,
          ),
        );
        runRef.current = null;
        setStatus("ready");
        setLoadingSession(false);
        void refreshSessions();
        scheduleFiles();
        return;
      }

      if (type === "error") {
        setChatError(typeof event.message === "string" ? event.message : "Something went wrong");
        setStatus("error");
        setLoadingSession(false);
      }
    },
    [
      appendDelta,
      ensureAssistant,
      finishBlock,
      publish,
      refreshSessions,
      replaceMessage,
      scheduleFiles,
      settleTool,
      upsertTool,
    ],
  );

  /* ---------------------------------------------------------------- connection */

  const connectStream = useCallback(
    (id: string, reset: boolean) => {
      closeStream();
      const api = clientRef.current;
      if (!api) return;
      if (reset) {
        publish([]);
        runRef.current = null;
        setStatus("ready");
        setChatError(null);
        setFiles([]);
        setTokensUsed(0);
        setLoadingSession(true);
      }
      const source = new EventSource(api.eventsUrl(id));
      esRef.current = source;
      source.addEventListener("snapshot", (raw) => {
        try {
          const data = JSON.parse((raw as MessageEvent).data) as {
            messages?: unknown[];
            meta?: SessionMeta;
          };
          publish(messagesFromSnapshot(data.messages ?? []));
          if (data.meta?.model) {
            modelRefValue.current = data.meta.model;
            setModelState(data.meta.model);
          }
          if (data.meta?.thinkingLevel) {
            levelRef.current = data.meta.thinkingLevel;
            setThinkingLevelState(data.meta.thinkingLevel);
          }
          setLoadingSession(false);
        } catch {
          setLoadingSession(false);
        }
        void refreshFiles(id);
      });
      source.onmessage = (raw) => {
        try {
          applyEvent(JSON.parse(raw.data) as Record<string, unknown>);
        } catch {
          // a malformed frame must not kill the stream
        }
      };
    },
    [applyEvent, closeStream, publish, refreshFiles],
  );

  const openSession = useCallback(
    (id: string) => {
      setActive(id);
      setAttachments([]);
      connectStream(id, true);
    },
    [connectStream, setActive],
  );

  const pickModel = useCallback((list: ModelSummary[], preferred: string | null): string | null => {
    if (preferred && list.some((item) => modelRef(item) === preferred)) return preferred;
    const free = list.find((item) => item.configured && /[:/]free$/.test(item.id));
    const configured = list.find((item) => item.configured);
    const chosen = free ?? configured ?? list[0];
    return chosen ? modelRef(chosen) : null;
  }, []);

  const connect = useCallback(
    async (rawUrl: string, rawToken: string) => {
      setConnecting(true);
      setError("");
      const base = normaliseUrl(rawUrl);
      const candidate = new ApiClient(base, rawToken.trim());
      try {
        await candidate.health();
        const [modelData, providerData, settings] = await Promise.all([
          candidate.models(),
          candidate.providers(),
          candidate.settings(),
        ]);
        clientRef.current = candidate;
        setUrl(base);
        setToken(rawToken.trim());
        setConnected(true);
        setModels(modelData.models);
        setPresets(providerData.presets);
        setCustomProviders(providerData.custom);
        setConfiguredProviders(providerData.configured);

        let saved: { model?: string; thinkingLevel?: string } = {};
        try {
          saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as typeof saved;
        } catch {
          saved = {};
        }
        const preferred = saved.model ?? settings.defaultModel ?? null;
        const chosen = pickModel(modelData.models, preferred);
        const level = saved.thinkingLevel ?? settings.defaultThinkingLevel ?? "medium";
        modelRefValue.current = chosen;
        levelRef.current = level;
        setModelState(chosen);
        setThinkingLevelState(level);
        savePrefs(chosen, level);

        localStorage.setItem(
          CONNECTION_KEY,
          JSON.stringify({ url: base, token: rawToken.trim() }),
        );

        const data = await candidate.sessions();
        setSessions(data.sessions);
        if (data.sessions.length) {
          openSession(data.sessions[0].id);
        } else {
          setActive(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setConnected(false);
        clientRef.current = null;
      } finally {
        setConnecting(false);
      }
    },
    [openSession, pickModel, savePrefs, setActive],
  );

  const disconnect = useCallback(() => {
    closeStream();
    clientRef.current = null;
    setConnected(false);
    setActive(null);
    publish([]);
    setFiles([]);
    setSessions([]);
    setChatError(null);
    setStatus("ready");
    localStorage.removeItem(CONNECTION_KEY);
  }, [closeStream, publish, setActive]);

  /* ---------------------------------------------------------------- sessions */

  const ensureSession = useCallback(async (): Promise<string | null> => {
    const existing = activeIdRef.current;
    if (existing) return existing;
    const api = clientRef.current;
    if (!api) return null;
    try {
      const created = await api.createSession({
        model: modelRefValue.current ?? undefined,
        thinkingLevel: levelRef.current,
      });
      setSessions((prev) => [created.session, ...prev]);
      setActive(created.session.id);
      setAttachments([]);
      connectStream(created.session.id, false);
      return created.session.id;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, [connectStream, setActive]);

  const newSession = useCallback(async () => {
    const api = clientRef.current;
    if (!api) return;
    try {
      const created = await api.createSession({
        model: modelRefValue.current ?? undefined,
        thinkingLevel: levelRef.current,
      });
      setSessions((prev) => [created.session, ...prev]);
      setActive(created.session.id);
      setAttachments([]);
      connectStream(created.session.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [connectStream, setActive]);

  const deleteSession = useCallback(
    async (id: string) => {
      const api = clientRef.current;
      if (!api) return;
      try {
        await api.deleteSession(id);
        const remaining = sessions.filter((session) => session.id !== id);
        setSessions(remaining);
        if (activeIdRef.current === id) {
          closeStream();
          setActive(null);
          publish([]);
          setFiles([]);
          if (remaining.length) openSession(remaining[0].id);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [closeStream, openSession, publish, sessions, setActive],
  );

  /* ---------------------------------------------------------------- run */

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const api = clientRef.current;
      if (!api || (!trimmed && attachments.length === 0)) return;
      const id = await ensureSession();
      if (!id) return;

      let payload = trimmed || "Please read the attached file and help me with it.";
      if (attachments.length) {
        payload +=
          ATTACHMENT_NOTE + attachments.map((item) => `- ${item.path}`).join("\n");
      }
      setAttachments([]);

      publish([
        ...messagesRef.current,
        {
          id: nextId("u"),
          role: "user",
          parts: [{ type: "text", text: trimmed || "Read the attached file." }],
        },
      ]);
      runRef.current = null;
      setChatError(null);
      setStatus("submitted");
      try {
        await api.prompt(id, payload);
      } catch (cause) {
        setChatError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    },
    [attachments, ensureSession, publish],
  );

  const stop = useCallback(async () => {
    const api = clientRef.current;
    const id = activeIdRef.current;
    if (!api || !id) return;
    setStatus("ready");
    try {
      await api.abort(id);
    } catch {
      // the run may have already stopped
    }
  }, []);

  const attachFiles = useCallback(
    async (incoming: File[]) => {
      const api = clientRef.current;
      if (!api || !incoming.length) return;
      const id = await ensureSession();
      if (!id) return;
      for (const file of incoming) {
        try {
          const result = await api.upload(id, file);
          setAttachments((prev) => [
            ...prev,
            { name: file.name, path: result.path, size: result.size },
          ]);
        } catch (cause) {
          setChatError(cause instanceof Error ? cause.message : String(cause));
        }
      }
      scheduleFiles();
    },
    [ensureSession, scheduleFiles],
  );

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((item) => item.path !== path));
  }, []);

  const setModel = useCallback(
    (ref: string) => {
      modelRefValue.current = ref;
      setModelState(ref);
      savePrefs(ref, levelRef.current);
      const api = clientRef.current;
      const id = activeIdRef.current;
      if (api && id) {
        void api
          .updateSession(id, { model: ref })
          .then(() => refreshSessions())
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : String(cause)),
          );
      }
    },
    [refreshSessions, savePrefs],
  );

  const setThinkingLevel = useCallback(
    (level: string) => {
      levelRef.current = level;
      setThinkingLevelState(level);
      savePrefs(modelRefValue.current, level);
      const api = clientRef.current;
      const id = activeIdRef.current;
      if (api && id) {
        void api
          .updateSession(id, { thinkingLevel: level })
          .then(() => refreshSessions())
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : String(cause)),
          );
      }
    },
    [refreshSessions, savePrefs],
  );

  /* ---------------------------------------------------------------- providers */

  const setApiKey = useCallback(async (provider: string, key: string) => {
    const api = clientRef.current;
    if (!api) return;
    await api.setKey(provider, key);
    const [modelData, providerData] = await Promise.all([api.models(), api.providers()]);
    setModels(modelData.models);
    setPresets(providerData.presets);
    setCustomProviders(providerData.custom);
    setConfiguredProviders(providerData.configured);
  }, []);

  const removeApiKey = useCallback(async (provider: string) => {
    const api = clientRef.current;
    if (!api) return;
    await api.deleteKey(provider);
    const [modelData, providerData] = await Promise.all([api.models(), api.providers()]);
    setModels(modelData.models);
    setPresets(providerData.presets);
    setCustomProviders(providerData.custom);
    setConfiguredProviders(providerData.configured);
  }, []);

  const saveProvider = useCallback(async (provider: CustomProvider) => {
    const api = clientRef.current;
    if (!api) return;
    await api.saveProvider(provider);
    const [modelData, providerData] = await Promise.all([api.models(), api.providers()]);
    setModels(modelData.models);
    setPresets(providerData.presets);
    setCustomProviders(providerData.custom);
    setConfiguredProviders(providerData.configured);
  }, []);

  const deleteProvider = useCallback(async (id: string) => {
    const api = clientRef.current;
    if (!api) return;
    await api.deleteProvider(id);
    const [modelData, providerData] = await Promise.all([api.models(), api.providers()]);
    setModels(modelData.models);
    setPresets(providerData.presets);
    setCustomProviders(providerData.custom);
    setConfiguredProviders(providerData.configured);
  }, []);

  const fileUrl = useCallback((path: string, download = false) => {
    const api = clientRef.current;
    const id = activeIdRef.current;
    return api && id ? api.fileUrl(id, path, download) : "#";
  }, []);

  /* ---------------------------------------------------------------- boot + cleanup */

  useEffect(() => {
    let savedUrl = "";
    let savedToken = "";
    try {
      const raw = localStorage.getItem(CONNECTION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { url?: string; token?: string };
        savedUrl = parsed.url ?? "";
        savedToken = parsed.token ?? "";
      }
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as {
        model?: string;
        thinkingLevel?: string;
      };
      if (prefs.model) {
        modelRefValue.current = prefs.model;
        setModelState(prefs.model);
      }
      if (prefs.thinkingLevel) {
        levelRef.current = prefs.thinkingLevel;
        setThinkingLevelState(prefs.thinkingLevel);
      }
      setUrl(savedUrl);
      setToken(savedToken);
    } catch {
      // ignore corrupt storage
    }
    if (savedUrl && savedToken && !autoConnected.current) {
      autoConnected.current = true;
      void connect(savedUrl, savedToken);
    }
  }, [connect]);

  useEffect(
    () => () => {
      closeStream();
      if (filesTimer.current) clearTimeout(filesTimer.current);
    },
    [closeStream],
  );

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const configuredModels = models.filter((item) => configuredProviders.includes(item.provider));
  const activeModel = models.find((item) => modelRef(item) === model) ?? null;

  return {
    url,
    token,
    connected,
    connecting,
    error,
    clearError: () => setError(""),
    models,
    configuredModels,
    presets,
    customProviders,
    configuredProviders,
    sessions,
    activeId,
    activeSession,
    messages,
    status,
    chatError,
    clearChatError: () => setChatError(null),
    loadingSession,
    model,
    activeModel,
    thinkingLevel,
    files,
    attachments,
    tokensUsed,
    starters: STARTERS,
    connect,
    disconnect,
    newSession,
    openSession,
    deleteSession,
    send,
    stop,
    attachFiles,
    removeAttachment,
    setModel,
    setThinkingLevel,
    refreshFiles,
    refreshSessions,
    setApiKey,
    removeApiKey,
    saveProvider,
    deleteProvider,
    fileUrl,
  };
}

export type Mentor = ReturnType<typeof useMentor>;