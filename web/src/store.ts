import { reactive } from "vue";
import { ApiClient } from "./api";
import type { ChatMessage, ContentBlock, CustomProvider, ModelSummary, ProviderPreset, SessionMeta } from "./types";

const LS_KEY = "mentor.connection";
const PREFS_KEY = "mentor.prefs";

interface State {
  url: string;
  token: string;
  connected: boolean;
  connecting: boolean;
  error: string;
  models: ModelSummary[];
  presets: ProviderPreset[];
  customProviders: CustomProvider[];
  configuredProviders: string[];
  sessions: SessionMeta[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  streamText: string;
  busy: boolean;
  selectedModel: string | null;
  thinkingLevel: string;
  modelPickerOpen: boolean;
  settingsOpen: boolean;
  effortOpen: boolean;
  attachments: Attachment[];
}

export interface Attachment {
  name: string;
  path: string;
  size: number;
}

export const state = reactive<State>({
  url: "",
  token: "",
  connected: false,
  connecting: false,
  error: "",
  models: [],
  presets: [],
  customProviders: [],
  configuredProviders: [],
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamText: "",
  busy: false,
  selectedModel: null,
  thinkingLevel: "medium",
  modelPickerOpen: false,
  settingsOpen: false,
  effortOpen: false,
  attachments: [],
});

let client: ApiClient | null = null;
let es: EventSource | null = null;

function normaliseUrl(url: string): string {
  let value = url.trim();
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, "");
}

export function modelRef(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

export function loadSavedConnection(): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { url?: string; token?: string };
      state.url = saved.url ?? "";
      state.token = saved.token ?? "";
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const prefs = JSON.parse(raw) as { model?: string; thinkingLevel?: string };
      if (prefs.model) state.selectedModel = prefs.model;
      if (prefs.thinkingLevel) state.thinkingLevel = prefs.thinkingLevel;
    }
  } catch {
    // ignore
  }
}

function savePrefs(): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ model: state.selectedModel, thinkingLevel: state.thinkingLevel }),
    );
  } catch {
    // ignore
  }
}

function pickDefaultModel(): string | null {
  const free = state.models.find((m) => m.configured && /[:/]free$/.test(m.id));
  const configured = state.models.find((m) => m.configured);
  const chosen = free ?? configured ?? state.models[0];
  return chosen ? modelRef(chosen) : null;
}

export function modelLabel(ref: string | null): string {
  if (!ref) return "Select model";
  const found = state.models.find((m) => modelRef(m) === ref);
  return found ? found.name : ref;
}

export async function connect(url: string, token: string): Promise<void> {
  state.connecting = true;
  state.error = "";
  const base = normaliseUrl(url);
  const candidate = new ApiClient(base, token.trim());
  try {
    await candidate.health();
    const models = await candidate.models();
    const providers = await candidate.providers();
    const settings = await candidate.settings();
    client = candidate;
    state.url = base;
    state.token = token.trim();
    state.connected = true;
    state.models = models.models;
    state.presets = providers.presets;
    state.customProviders = providers.custom;
    state.configuredProviders = providers.configured;
    if (!state.selectedModel || !state.models.some((m) => modelRef(m) === state.selectedModel)) {
      const preferred = settings.defaultModel;
      state.selectedModel =
        preferred && state.models.some((m) => modelRef(m) === preferred)
          ? preferred
          : pickDefaultModel();
    }
    savePrefs();
    localStorage.setItem(LS_KEY, JSON.stringify({ url: state.url, token: state.token }));
    await refreshSessions();
    if (state.sessions.length) await openSession(state.sessions[0].id);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.connected = false;
    client = null;
  } finally {
    state.connecting = false;
  }
}

export function disconnect(): void {
  closeStream();
  state.connected = false;
  state.activeSessionId = null;
  state.messages = [];
  state.streamText = "";
  client = null;
  localStorage.removeItem(LS_KEY);
}

export async function refreshModels(): Promise<void> {
  if (!client) return;
  state.models = (await client.models()).models;
}
export async function refreshProviders(): Promise<void> {
  if (!client) return;
  const p = await client.providers();
  state.presets = p.presets;
  state.customProviders = p.custom;
  state.configuredProviders = p.configured;
}
export async function refreshSessions(): Promise<void> {
  if (!client) return;
  state.sessions = (await client.sessions()).sessions;
}

export function setSelectedModel(ref: string): void {
  state.selectedModel = ref;
  savePrefs();
}

export function setThinkingLevel(level: string): void {
  state.thinkingLevel = level;
  state.effortOpen = false;
  savePrefs();
}

export function removeAttachment(path: string): void {
  state.attachments = state.attachments.filter((item) => item.path !== path);
}

export function clearError(): void {
  state.error = "";
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  if (!client) return;
  await client.setKey(provider, key);
  await refreshProviders();
  await refreshModels();
}
export async function removeApiKey(provider: string): Promise<void> {
  if (!client) return;
  await client.deleteKey(provider);
  await refreshProviders();
  await refreshModels();
}
export async function saveProvider(provider: CustomProvider): Promise<void> {
  if (!client) return;
  await client.saveProvider(provider);
  await refreshProviders();
  await refreshModels();
}
export async function deleteProvider(id: string): Promise<void> {
  if (!client) return;
  await client.deleteProvider(id);
  await refreshProviders();
  await refreshModels();
}

export function closeStream(): void {
  es?.close();
  es = null;
}

export async function openSession(id: string): Promise<void> {
  if (!client) return;
  state.activeSessionId = id;
  state.messages = [];
  state.streamText = "";
  state.busy = false;
  closeStream();
  const activeClient = client;
  es = new EventSource(activeClient.eventsUrl(id));
  es.addEventListener("snapshot", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { messages?: unknown[] };
    state.messages = (data.messages ?? []).map(toChatMessage).filter((m) => m.role !== "system");
  });
  es.onmessage = (event) => handleEvent(JSON.parse(event.data));
}

export async function createSession(): Promise<void> {
  if (!client) return;
  const created = await client.createSession({
    model: state.selectedModel ?? undefined,
    thinkingLevel: state.thinkingLevel,
  });
  state.sessions.unshift(created.session);
  await openSession(created.session.id);
}

export async function deleteSession(id: string): Promise<void> {
  if (!client) return;
  await client.deleteSession(id);
  if (state.activeSessionId === id) {
    closeStream();
    state.activeSessionId = null;
    state.messages = [];
  }
  await refreshSessions();
}

export async function send(text: string): Promise<void> {
  if (!client) return;
  if (!state.activeSessionId) await createSession();
  if (!state.activeSessionId) return;
  let payload = text;
  if (state.attachments.length) {
    payload +=
      "\n\nAttached files (read them with read_document using the given path):\n" +
      state.attachments.map((item) => `- ${item.path}`).join("\n");
  }
  state.attachments = [];
  state.busy = true;
  try {
    await client.prompt(state.activeSessionId, payload);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.busy = false;
  }
}

export async function abort(): Promise<void> {
  if (!client || !state.activeSessionId) return;
  await client.abort(state.activeSessionId);
}

export async function attachFile(file: File): Promise<Attachment | null> {
  if (!client) return null;
  if (!state.activeSessionId) await createSession();
  if (!state.activeSessionId) return null;
  const result = await client.upload(state.activeSessionId, file);
  const attachment: Attachment = { name: file.name, path: result.path, size: result.size };
  state.attachments.push(attachment);
  return attachment;
}

function handleEvent(event: Record<string, unknown>): void {
  switch (event.type) {
    case "message_start": {
      const message = toChatMessage(event.message);
      if (message.role === "user") state.messages.push(message);
      if (message.role === "assistant") state.streamText = "";
      break;
    }
    case "message_update": {
      if (event.event === "text_delta" && typeof event.delta === "string") {
        state.streamText += event.delta;
      }
      break;
    }
    case "message_end": {
      const message = toChatMessage(event.message);
      if (message.role === "assistant") {
        state.messages.push(message);
        state.streamText = "";
      }
      break;
    }
    case "agent_settled":
      state.busy = false;
      void refreshSessions();
      break;
    case "error":
      state.error = typeof event.message === "string" ? event.message : "error";
      state.busy = false;
      break;
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => (block as ContentBlock).type === "text")
      .map((block) => (block as ContentBlock).text ?? "")
      .join("");
  }
  return "";
}

function toChatMessage(raw: unknown): ChatMessage {
  const message = (raw ?? {}) as Record<string, unknown>;
  const role = (message.role as ChatMessage["role"]) ?? "assistant";
  if (role === "assistant") {
    const blocks = (Array.isArray(message.content) ? message.content : []) as ContentBlock[];
    return { role, content: blocks };
  }
  if (role === "toolResult") {
    return {
      role,
      content: textFromContent(message.content),
      toolName: message.toolName as string | undefined,
      isError: Boolean(message.isError),
    };
  }
  return { role, content: textFromContent(message.content) };
}
