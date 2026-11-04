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
  createdAt: number;
  updatedAt: number;
}

export interface ContentBlock {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant" | "toolResult" | "system";
  content: string | ContentBlock[];
  toolName?: string;
  isError?: boolean;
}
