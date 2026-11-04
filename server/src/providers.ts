import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureDirs, paths } from "./config.js";

/** A model the user defined for a custom OpenAI-compatible provider. */
export interface CustomModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** A user-defined provider, persisted into Pi's models.json. */
export interface CustomProvider {
  id: string;
  name: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
  models?: CustomModel[];
}

export interface ModelsFile {
  providers: Record<string, CustomProvider>;
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

export const PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "builtin",
    blurb: "One key, hundreds of models. Has a free tier and a `:free` router.",
    signupUrl: "https://openrouter.ai/keys",
    free: true,
  },
  {
    id: "kilo",
    name: "Kilo Gateway",
    kind: "openai-compatible",
    blurb: "Kilo Code's gateway. `:free` models work even without an account.",
    signupUrl: "https://kilo.ai/docs/gateway",
    baseUrl: "https://ai-gateway.kilo.ai/api/v1",
    api: "openai-completions",
    free: true,
    defaultModel: "kilo-auto/free",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "builtin",
    blurb: "Very fast inference, generous free tier.",
    signupUrl: "https://console.groq.com/keys",
    free: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    kind: "builtin",
    blurb: "Fast inference, free tier.",
    signupUrl: "https://cloud.cerebras.ai/",
    free: true,
  },
  {
    id: "google",
    name: "Google Gemini",
    kind: "builtin",
    blurb: "Strong free tier. Vision-capable, useful as an OCR fallback.",
    signupUrl: "https://aistudio.google.com/apikey",
    free: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "builtin",
    blurb: "Paid API access.",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "builtin",
    blurb: "Paid API access.",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "builtin",
    blurb: "Cheap and capable.",
    signupUrl: "https://platform.deepseek.com/",
  },
];

function readRawModels(): Record<string, unknown> {
  if (!existsSync(paths.models)) return {};
  try {
    return JSON.parse(readFileSync(paths.models, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readModelsFile(): ModelsFile {
  const raw = readRawModels();
  const providers = (raw.providers ?? {}) as Record<string, CustomProvider>;
  return { providers };
}

export function writeModelsFile(file: ModelsFile): void {
  ensureDirs();
  const raw = readRawModels();
  raw.providers = file.providers;
  writeFileSync(paths.models, JSON.stringify(raw, null, 2) + "\n", "utf8");
}

export function upsertProvider(provider: CustomProvider): void {
  const file = readModelsFile();
  file.providers[provider.id] = provider;
  writeModelsFile(file);
}

export function removeProvider(id: string): void {
  const file = readModelsFile();
  delete file.providers[id];
  writeModelsFile(file);
}

export function buildCustomProvider(input: {
  id: string;
  name?: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: CustomModel[];
}): CustomProvider {
  return {
    id: input.id,
    name: input.name ?? input.id,
    baseUrl: input.baseUrl,
    api: input.api ?? "openai-completions",
    apiKey: input.apiKey,
    authHeader: true,
    headers: input.headers,
    models: (input.models ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      reasoning: m.reasoning ?? false,
      input: m.input ?? ["text"],
      contextWindow: m.contextWindow ?? 128000,
      maxTokens: m.maxTokens ?? 8192,
      cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
  };
}

// --- auth.json (built-in provider API keys) ---

type AuthFile = Record<string, { type: "api_key"; key?: string; env?: Record<string, string> }>;

export function readAuth(): AuthFile {
  if (!existsSync(paths.auth)) return {};
  try {
    return JSON.parse(readFileSync(paths.auth, "utf8")) as AuthFile;
  } catch {
    return {};
  }
}

function writeAuth(auth: AuthFile): void {
  ensureDirs();
  writeFileSync(paths.auth, JSON.stringify(auth, null, 2) + "\n", "utf8");
}

export function setApiKey(providerId: string, key: string): void {
  const auth = readAuth();
  auth[providerId] = { type: "api_key", key };
  writeAuth(auth);
}

export function removeApiKey(providerId: string): void {
  const auth = readAuth();
  delete auth[providerId];
  writeAuth(auth);
}

export function providerIdsWithKey(): Set<string> {
  const ids = new Set<string>(Object.keys(readAuth()));
  for (const [id, provider] of Object.entries(readModelsFile().providers)) {
    if (provider.apiKey) ids.add(id);
  }
  return ids;
}
