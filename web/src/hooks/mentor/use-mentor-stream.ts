import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { stripAttachmentNote } from "@/lib/attachments";
import type { ChatcnMessage, ChatcnPart, ChatcnTextPart, ChatcnToolPart } from "@/lib/chatcn-types";
import type { ApiClient, SessionMeta, WorkspaceFile } from "@/lib/api";
import {
  isTerminal,
  messagesFromSnapshot,
  normalizeOutput,
  record,
  resultText,
  textFromContent,
  type PiBlock,
  type PiMessage,
} from "@/lib/mentor-messages";
import { nextId, type ChatStatus, type RunState } from "./mentor-shared";

interface StreamDeps {
  clientRef: MutableRefObject<ApiClient | null>;
  esRef: MutableRefObject<EventSource | null>;
  messagesRef: MutableRefObject<ChatcnMessage[]>;
  runRef: MutableRefObject<RunState | null>;
  modelRefValue: MutableRefObject<string | null>;
  levelRef: MutableRefObject<string>;
  lastThinkLevel: MutableRefObject<string>;
  searchRef: MutableRefObject<boolean>;
  snapshotWaiters: MutableRefObject<Array<() => void>>;
  publish: (next: ChatcnMessage[]) => void;
  replaceMessage: (id: string, next: ChatcnMessage) => void;
  scheduleFiles: () => void;
  refreshSessions: () => Promise<void>;
  refreshFiles: (id?: string) => Promise<void>;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setTokensUsed: Dispatch<SetStateAction<number>>;
  setChatError: Dispatch<SetStateAction<string | null>>;
  setLoadingSession: Dispatch<SetStateAction<boolean>>;
  setModelState: Dispatch<SetStateAction<string | null>>;
  setThinkingLevelState: Dispatch<SetStateAction<string>>;
  setSearchEnabledState: Dispatch<SetStateAction<boolean>>;
  setFiles: Dispatch<SetStateAction<WorkspaceFile[]>>;
}

/**
 * The streaming reducer and the EventSource wiring. These are split out of `useMentor` so the
 * hook file stays readable; the callbacks read the same refs and setters the hook owns.
 */
export function useMentorStream(deps: StreamDeps) {
  const {
    clientRef,
    esRef,
    messagesRef,
    runRef,
    modelRefValue,
    levelRef,
    lastThinkLevel,
    searchRef,
    snapshotWaiters,
    publish,
    replaceMessage,
    scheduleFiles,
    refreshSessions,
    refreshFiles,
    setStatus,
    setTokensUsed,
    setChatError,
    setLoadingSession,
    setModelState,
    setThinkingLevelState,
    setSearchEnabledState,
    setFiles,
  } = deps;

  /* ---------------------------------------------------------------- streaming reducer */

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, [esRef]);

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
      blocks: new Map(),
      tools: new Map(),
    };
    return message;
  }, [publish, messagesRef, runRef]);

  /**
   * The part for a content block. A new block always gets a new part: merging by
   * kind alone puts later text before the tool call that came between them.
   */
  const blockPart = useCallback(
    (
      run: RunState,
      parts: ChatcnMessage["parts"],
      contentIndex: number | undefined,
      kind: "text" | "reasoning",
    ): { index: number; parts: ChatcnMessage["parts"] } => {
      const key = typeof contentIndex === "number" ? contentIndex : parts.length;
      const found = run.blocks.get(key);
      const existing = found === undefined ? undefined : parts[found];
      if (
        existing &&
        existing.type === kind &&
        (existing as { state?: string }).state === "streaming"
      ) {
        return { index: found as number, parts };
      }
      const index = parts.length;
      run.blocks.set(key, index);
      return {
        index,
        parts: [...parts, { type: kind, text: "", state: "streaming" } as ChatcnPart],
      };
    },
    [],
  );

  const appendDelta = useCallback(
    (kind: "text" | "reasoning", delta: string, contentIndex?: number) => {
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const next = blockPart(run, message.parts, contentIndex, kind);
      const parts = next.parts.map((part, i) =>
        i === next.index
          ? ({ ...part, text: `${(part as { text?: string }).text ?? ""}${delta}` } as ChatcnPart)
          : part,
      );
      replaceMessage(message.id, { ...message, parts });
    },
    [blockPart, ensureAssistant, replaceMessage, runRef],
  );

  const finishBlock = useCallback(
    (kind: "text" | "reasoning", text: string, contentIndex?: number) => {
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const key = typeof contentIndex === "number" ? contentIndex : undefined;
      const found = key === undefined ? undefined : run.blocks.get(key);
      const index = found;
      const existing = index === undefined ? undefined : message.parts[index];
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
        return;
      }
      if (!text) return;
      // The final text did not stream in (a cached or replayed turn): add it at the end.
      const at = message.parts.length;
      if (key !== undefined) run.blocks.set(key, at);
      replaceMessage(message.id, {
        ...message,
        parts: [...message.parts, { type: kind, text, state: "done" } as ChatcnPart],
      });
    },
    [ensureAssistant, replaceMessage, runRef],
  );

  const upsertTool = useCallback(
    (call: { id?: string; name?: string; arguments?: unknown }, contentIndex?: number) => {
      if (!call.id || !call.name) return;
      const message = ensureAssistant();
      const run = runRef.current;
      if (!run) return;
      const existingIndex = run.tools.get(call.id);
      const blockIndex =
        typeof contentIndex === "number" ? run.blocks.get(contentIndex) : undefined;
      const index = existingIndex ?? blockIndex;
      const part: ChatcnToolPart = {
        type: `tool-${call.name}`,
        toolCallId: call.id,
        state:
          index !== undefined && isTerminal(message.parts[index] as ChatcnToolPart)
            ? (message.parts[index] as ChatcnToolPart).state
            : "input-available",
        input:
          call.arguments ??
          (index !== undefined
            ? (message.parts[index] as ChatcnToolPart | undefined)?.input
            : undefined) ??
          {},
      };
      if (index !== undefined) {
        // Replace the block in place. Some providers stream the call's JSON as text
        // for the same content index, and leaving that text behind is what makes a
        // finished tool call look like a wall of raw text.
        run.tools.set(call.id, index);
        if (typeof contentIndex === "number") run.blocks.set(contentIndex, index);
        replaceMessage(message.id, {
          ...message,
          parts: message.parts.map((item, i) => (i === index ? part : item)),
        });
        return;
      }
      const at = message.parts.length;
      run.tools.set(call.id, at);
      if (typeof contentIndex === "number") run.blocks.set(contentIndex, at);
      replaceMessage(message.id, { ...message, parts: [...message.parts, part] });
    },
    [ensureAssistant, replaceMessage, runRef],
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
    [ensureAssistant, replaceMessage, scheduleFiles, runRef],
  );

  const applyEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = event.type;
      if (type === "message_start") {
        const message = event.message as PiMessage | undefined;
        if (message?.role === "user") {
          const text = stripAttachmentNote(textFromContent(message.content));
          // The optimistic bubble is already in the thread. Do not add the same
          // turn twice just because the server echoed it back.
          const lastUser = [...messagesRef.current].reverse().find((item) => item.role === "user");
          const previous = lastUser?.parts
            .filter((part): part is ChatcnTextPart => part.type === "text")
            .map((part) => part.text)
            .join("\n\n")
            .trim();
          if (previous === text.trim()) return;
          publish([
            ...messagesRef.current,
            {
              id: nextId("u"),
              role: "user",
              parts: [{ type: "text", text }],
            },
          ]);
          return;
        }
        if (message?.role === "assistant") {
          const run = runRef.current;
          // Content indices restart for every assistant message in a run.
          if (run) run.blocks = new Map();
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
        const contentIndex =
          typeof event.contentIndex === "number" ? event.contentIndex : undefined;
        if (inner === "text_delta" && delta) appendDelta("text", delta, contentIndex);
        else if (inner === "thinking_delta" && delta)
          appendDelta("reasoning", delta, contentIndex);
        else if (inner === "toolcall_end" && event.toolCall) {
          const call = event.toolCall as { id?: string; name?: string; arguments?: unknown };
          upsertTool(call, contentIndex);
        }
        return;
      }

      if (type === "message_end") {
        const message = event.message as PiMessage | undefined;
        if (message?.role !== "assistant") return;
        const usage = record((message as { usage?: unknown }).usage);
        if (typeof usage.totalTokens === "number") setTokensUsed(usage.totalTokens);
        const blocks = Array.isArray(message.content) ? (message.content as PiBlock[]) : [];
        blocks.forEach((block, index) => {
          if (block.type === "text") finishBlock("text", block.text ?? "", index);
          else if (block.type === "thinking")
            finishBlock("reasoning", block.thinking ?? "", index);
          else if (block.type === "toolCall")
            upsertTool({ id: block.id, name: block.name, arguments: block.arguments }, index);
        });
        const run = runRef.current;
        if (run) run.blocks = new Map();
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

      if (type === "model_switch") {
        // The tutor hit a quota wall and moved to another free model. No error, just the new
        // name in the menu and in the next session.
        if (typeof event.to === "string") setModelState(event.to);
        void refreshSessions();
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
      messagesRef,
      publish,
      refreshSessions,
      replaceMessage,
      runRef,
      scheduleFiles,
      setChatError,
      setLoadingSession,
      setModelState,
      setStatus,
      setTokensUsed,
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
            busy?: boolean;
          };
          publish(messagesFromSnapshot(data.messages ?? []));
          // The run keeps going on the server while the app is backgrounded. Reconcile the
          // working state with the snapshot so returning shows the run, not a dead chat.
          if (data.busy === true) setStatus("streaming");
          else if (data.busy === false) {
            setStatus((current) =>
              current === "streaming" || current === "submitted" ? "ready" : current,
            );
          }
          if (data.meta?.model) {
            modelRefValue.current = data.meta.model;
            setModelState(data.meta.model);
          }
          if (data.meta?.thinkingLevel) {
            levelRef.current = data.meta.thinkingLevel;
            if (data.meta.thinkingLevel !== "off") lastThinkLevel.current = data.meta.thinkingLevel;
            setThinkingLevelState(data.meta.thinkingLevel);
          }
          if (typeof data.meta?.webAccess === "boolean") {
            searchRef.current = data.meta.webAccess;
            setSearchEnabledState(data.meta.webAccess);
          }
          setLoadingSession(false);
        } catch {
          setLoadingSession(false);
        }
        const waiters = snapshotWaiters.current;
        snapshotWaiters.current = [];
        for (const resolve of waiters) resolve();
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
    [
      applyEvent,
      clientRef,
      closeStream,
      esRef,
      lastThinkLevel,
      levelRef,
      modelRefValue,
      publish,
      refreshFiles,
      runRef,
      searchRef,
      setChatError,
      setFiles,
      setLoadingSession,
      setModelState,
      setSearchEnabledState,
      setStatus,
      setThinkingLevelState,
      setTokensUsed,
      snapshotWaiters,
    ],
  );

  return { applyEvent, connectStream, closeStream };
}
