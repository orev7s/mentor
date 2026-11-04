import type { CustomProvider, ModelSummary, ProviderPreset, SessionMeta } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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
    return this.request<{ presets: ProviderPreset[]; custom: CustomProvider[]; configured: string[] }>(
      "GET",
      "/providers",
    );
  }
  setKey(provider: string, key: string) {
    return this.request<{ ok: boolean }>("POST", "/models/keys", { provider, key });
  }
  deleteKey(provider: string) {
    return this.request<{ ok: boolean }>("DELETE", `/models/keys/${encodeURIComponent(provider)}`);
  }
  saveProvider(provider: CustomProvider) {
    return this.request<{ ok: boolean }>("PUT", `/providers/${encodeURIComponent(provider.id)}`, provider);
  }
  deleteProvider(id: string) {
    return this.request<{ ok: boolean }>("DELETE", `/providers/${encodeURIComponent(id)}`);
  }
  sessions() {
    return this.request<{ sessions: SessionMeta[] }>("GET", "/sessions");
  }
  createSession(body: { model?: string; thinkingLevel?: string; title?: string }) {
    return this.request<{ session: SessionMeta }>("POST", "/sessions", body);
  }
  session(id: string) {
    return this.request<{ meta: SessionMeta; messages: unknown[] }>("GET", `/sessions/${id}`);
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
  eventsUrl(id: string): string {
    return `${this.baseUrl}/sessions/${id}/events?token=${encodeURIComponent(this.token)}`;
  }
  async upload(sessionId: string, file: File): Promise<{ path: string; size: number }> {
    const form = new FormData();
    form.append("sessionId", sessionId);
    form.append("file", file);
    const res = await fetch(`${this.baseUrl}/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, "upload failed");
    return (await res.json()) as { path: string; size: number };
  }
}
