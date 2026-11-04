import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatcnMessage, ChatcnTextPart } from "@/lib/chatcn-types";
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
import { messageTextOf } from "@/lib/mentor-messages";
import { nextId, type ChatStatus, type RunState } from "./mentor/mentor-shared";
import { useMentorStream } from "./mentor/use-mentor-stream";

export type { ChatStatus } from "./mentor/mentor-shared";
export { messagesFromSnapshot } from "@/lib/mentor-messages";

const CONNECTION_KEY = "mentor.connection";
const PREFS_KEY = "mentor.prefs";
const STARTERS = [
  "Explain photosynthesis like I'm in 8th grade",
  "Quiz me on my notes",
  "Summarize this PDF",
  "Solve a quadratic step by step",
];

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
  /** Search is on by default: the agent may use web_search and web_fetch. */
  const [searchEnabled, setSearchEnabledState] = useState(true);

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** Files still uploading, shown as placeholders so Send can wait for them. */
  const [uploads, setUploads] = useState<{ id: string; name: string }[]>([]);
  const [tokensUsed, setTokensUsed] = useState(0);

  const clientRef = useRef<ApiClient | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<ChatcnMessage[]>([]);
  const runRef = useRef<RunState | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const modelRefValue = useRef<string | null>(null);
  const levelRef = useRef("medium");
  /** The last thinking level that was not "off", restored when Think is turned back on. */
  const lastThinkLevel = useRef("medium");
  const searchRef = useRef(true);
  const filesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoConnected = useRef(false);
  /** Resolvers waiting for the next session snapshot, used when seeding a fork. */
  const snapshotWaiters = useRef<Array<() => void>>([]);

  const waitForSnapshot = useCallback(
    () =>
      new Promise<void>((resolve) => {
        snapshotWaiters.current.push(resolve);
        window.setTimeout(resolve, 1500);
      }),
    [],
  );

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

  const { connectStream, closeStream } = useMentorStream({
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
  });

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
        if (level !== "off") lastThinkLevel.current = level;
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
    setAttachments([]);
    setUploads([]);
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
        webAccess: searchRef.current,
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
        webAccess: searchRef.current,
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
      if (!api || uploads.length || (!trimmed && attachments.length === 0)) return;
      const id = await ensureSession();
      if (!id) return;

      // Same text sent twice in a row (for example a double tap) is one turn, not two.
      const last = messagesRef.current[messagesRef.current.length - 1];
      if (!attachments.length && last?.role === "user") {
        const previous = last.parts
          .filter((part): part is ChatcnTextPart => part.type === "text")
          .map((part) => part.text)
          .join("\n\n")
          .trim();
        if (previous === trimmed) return;
      }

      const pending = attachments;
      const bubble = trimmed || "Read the attached file.";
      const outgoing = trimmed || "Please read the attached file and help me with it.";
      setAttachments([]);

      publish([
        ...messagesRef.current,
        {
          id: nextId("u"),
          role: "user",
          parts: [{ type: "text", text: bubble }],
        },
      ]);
      runRef.current = null;
      setChatError(null);
      setStatus("submitted");
      try {
        // Photos are sent as vision input by the server; other files come back as a
        // path note the model reads with a tool. The bubble above stays as typed.
        await api.prompt(
          id,
          outgoing,
          pending.map((item) => ({
            path: item.path,
            previewPath: item.previewPath,
            name: item.name,
          })),
        );
      } catch (cause) {
        setChatError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    },
    [attachments, ensureSession, publish, uploads.length],
  );

  /**
   * Branch the conversation at a message.
   *
   * A user message is replayed as the first prompt of a new chat, with every
   * earlier turn seeded as context. An assistant message keeps the reply too and
   * opens the new chat ready for the next question.
   */
  const forkMessage = useCallback(
    async (message: ChatcnMessage) => {
      const api = clientRef.current;
      if (!api) return;
      const index = messagesRef.current.findIndex((item) => item.id === message.id);
      if (index < 0) return;
      const at = messagesRef.current[index];
      const keep = at.role === "assistant" ? index + 1 : index;
      const seed = messagesRef.current
        .slice(0, keep)
        .map((item) => ({ role: item.role, text: messageTextOf(item) }))
        .filter(
          (item): item is { role: "user" | "assistant"; text: string } =>
            (item.role === "user" || item.role === "assistant") && item.text.length > 0,
        );
      const resend = at.role === "user" ? messageTextOf(at) : "";
      const title = (resend || seed.find((item) => item.role === "user")?.text || "Forked chat")
        .split("\n")[0]
        .slice(0, 60);

      try {
        const created = await api.createSession({
          model: modelRefValue.current ?? undefined,
          thinkingLevel: levelRef.current,
          webAccess: searchRef.current,
          parent: activeIdRef.current ?? undefined,
          seed,
          title,
        });
        setSessions((prev) => [created.session, ...prev]);
        setActive(created.session.id);
        setAttachments([]);
        setStatus("ready");
        connectStream(created.session.id, true);
        await waitForSnapshot();
        if (resend) await send(resend);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [connectStream, send, setActive, waitForSnapshot],
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

  /** Hand the student's answers to the ask_student call that is waiting. */
  const answerQuestions = useCallback(
    async (toolCallId: string, answers: { question: string; selected: string[] }[]) => {
      const api = clientRef.current;
      const id = activeIdRef.current;
      if (!api || !id) throw new Error("No active chat.");
      await api.answerQuestions(id, toolCallId, answers);
    },
    [],
  );

  /** Transcribe a recorded clip on the server, which calls Groq Whisper. */
  const transcribe = useCallback(async (audio: Blob, language?: string) => {
    const api = clientRef.current;
    if (!api) throw new Error("Not connected.");
    const { text } = await api.transcribe(audio, language);
    return text;
  }, []);

  const attachFiles = useCallback(
    async (incoming: File[]) => {
      const api = clientRef.current;
      if (!api || !incoming.length) return;
      const id = await ensureSession();
      if (!id) return;
      // Show a placeholder per file before the first byte goes out. Send waits on these,
      // so a prompt never leaves with a half-uploaded attachment.
      const pending = incoming.map((file) => ({ id: nextId("up"), name: file.name }));
      setUploads((prev) => [...prev, ...pending]);
      for (let i = 0; i < incoming.length; i += 1) {
        const file = incoming[i]!;
        const placeholder = pending[i]!;
        try {
          const result = await api.upload(id, file);
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              path: result.path,
              size: result.size,
              thumbPath: result.thumbPath,
              previewPath: result.previewPath,
            },
          ]);
        } catch (cause) {
          setChatError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setUploads((prev) => prev.filter((item) => item.id !== placeholder.id));
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
      if (level !== "off") lastThinkLevel.current = level;
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

  /** The composer's Think switch: on restores the last level, off sends "off". */
  const setThinkingEnabled = useCallback(
    (enabled: boolean) => {
      setThinkingLevel(enabled ? lastThinkLevel.current || "medium" : "off");
    },
    [setThinkingLevel],
  );

  /** The composer's Search switch. Off removes web_search and web_fetch from the session. */
  const setSearchEnabled = useCallback(
    (enabled: boolean) => {
      searchRef.current = enabled;
      setSearchEnabledState(enabled);
      const api = clientRef.current;
      const id = activeIdRef.current;
      if (api && id) {
        void api
          .updateSession(id, { webAccess: enabled })
          .then(() => refreshSessions())
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : String(cause)),
          );
      }
    },
    [refreshSessions],
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

  // Android can pause the WebView and drop the SSE socket while the app is in the
  // background. The server keeps the run going, so reconnect on return to pick up
  // the snapshot and anything that happened while the socket was down.
  useEffect(() => {
    const resubscribe = () => {
      if (document.visibilityState === "hidden") return;
      const id = activeIdRef.current;
      if (id) connectStream(id, false);
    };
    document.addEventListener("visibilitychange", resubscribe);
    window.addEventListener("focus", resubscribe);
    return () => {
      document.removeEventListener("visibilitychange", resubscribe);
      window.removeEventListener("focus", resubscribe);
    };
  }, [connectStream]);

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

  // A model with no non-thinking mode cannot honour "off". When the student switches to one,
  // put thinking back on so the hidden control never leaves the session in an invalid state.
  useEffect(() => {
    if (!activeModel || activeModel.canDisableThinking) return;
    if (levelRef.current !== "off") return;
    setThinkingLevel(lastThinkLevel.current || "medium");
  }, [activeModel, setThinkingLevel]);

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
    thinkingEnabled: thinkingLevel !== "off",
    canThink: Boolean(activeModel?.canDisableThinking),
    setThinkingEnabled,
    searchEnabled,
    setSearchEnabled,
    files,
    attachments,
    uploads,
    tokensUsed,
    starters: STARTERS,
    connect,
    disconnect,
    newSession,
    openSession,
    deleteSession,
    send,
    stop,
    answerQuestions,
    transcribe,
    forkMessage,
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
