export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  input: string[];
  configured: boolean;
}

export interface ProviderPreset {
  id: string;
  name: string;
  kind: "builtin" | "openai-compatible";
  blurb: string;
  signupUrl?: string;
  baseUrl?: string;
  api?: string;
  free?: boolean;
  defaultModel?: string;
}

export interface CustomModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: CustomModel[];
}

export interface SessionMeta {
  id: string;
  title: string;
  model?: string;
  thinkingLevel: string;
  cwd: string;
  parent?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceFile {
  path: string;
  size: number;
  mtime: number;
  ext: string;
  kind: "pdf" | "image" | "document" | "code" | "data" | "other";
}

export interface Attachment {
  name: string;
  path: string;
  size: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = ((await res.json()) as { error?: string }).error ?? message;
      } catch {
        // keep statusText
      }
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  }

  health() {
    return this.request<{ ok: boolean }>("GET", "/health");
  }

  models() {
    return this.request<{ models: ModelSummary[] }>("GET", "/models");
  }

  settings() {
    return this.request<{ defaultModel: string | null; defaultThinkingLevel: string }>(
      "GET",
      "/settings",
    );
  }

  saveSettings(body: { defaultModel?: string | null; defaultThinkingLevel?: string }) {
    return this.request<{ ok: boolean }>("POST", "/settings", body);
  }

  providers() {
    return this.request<{
      presets: ProviderPreset[];
      custom: CustomProvider[];
      configured: string[];
    }>("GET", "/providers");
  }

  setKey(provider: string, key: string) {
    return this.request<{ ok: boolean }>("POST", "/models/keys", { provider, key });
  }

  deleteKey(provider: string) {
    return this.request<{ ok: boolean }>("DELETE", `/models/keys/${encodeURIComponent(provider)}`);
  }

  saveProvider(provider: CustomProvider) {
    return this.request<{ ok: boolean }>(
      "PUT",
      `/providers/${encodeURIComponent(provider.id)}`,
      provider,
    );
  }

  deleteProvider(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/providers/${encodeURIComponent(id)}`);
  }

  sessions() {
    return this.request<{ sessions: SessionMeta[] }>("GET", "/sessions");
  }

  createSession(body: {
    model?: string;
    thinkingLevel?: string;
    title?: string;
    parent?: string;
    seed?: { role: "user" | "assistant"; text: string }[];
  }) {
    return this.request<{ session: SessionMeta }>("POST", "/sessions", body);
  }

  session(id: string) {
    return this.request<{ meta: SessionMeta; messages: unknown[] }>("GET", `/sessions/${id}`);
  }

  updateSession(id: string, body: { model?: string; thinkingLevel?: string }) {
    return this.request<{ session: SessionMeta }>("PATCH", `/sessions/${id}`, body);
  }

  deleteSession(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/sessions/${id}`);
  }

  prompt(id: string, text: string) {
    return this.request<{ ok: boolean }>("POST", `/sessions/${id}/prompt`, { text });
  }

  abort(id: string) {
    return this.request<{ ok: boolean }>("POST", `/sessions/${id}/abort`);
  }

  files(id: string) {
    return this.request<{ files: WorkspaceFile[] }>("GET", `/sessions/${id}/files`);
  }

  eventsUrl(id: string): string {
    return `${this.baseUrl}/sessions/${id}/events?token=${encodeURIComponent(this.token)}`;
  }

  fileUrl(id: string, path: string, download = false): string {
    const params = new URLSearchParams({ path, token: this.token });
    if (download) params.set("download", "1");
    return `${this.baseUrl}/sessions/${id}/file?${params.toString()}`;
  }

  async upload(
    sessionId: string,
    file: File,
  ): Promise<{ path: string; size: number; mime?: string }> {
    const form = new FormData();
    form.append("sessionId", sessionId);
    form.append("file", file);
    const res = await fetch(`${this.baseUrl}/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, "Upload failed");
    return (await res.json()) as { path: string; size: number; mime?: string };
  }
}

export function normaliseUrl(url: string): string {
  let value = url.trim();
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, "");
}

export function modelRef(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}