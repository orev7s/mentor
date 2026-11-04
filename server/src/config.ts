import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export type ThinkingLevelName =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ServerConfig {
  token: string;
  host: string;
  port: number;
  createdAt: string;
  /** Default model as "provider/modelId". */
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevelName;
}

const dataDir = process.env.MENTOR_DATA_DIR ?? join(homedir(), ".mentor");

export const paths = {
  dataDir,
  config: join(dataDir, "config.json"),
  /** Pi agent dir: holds auth.json and models.json for our runtime. */
  agentDir: join(dataDir, "pi-agent"),
  auth: join(dataDir, "pi-agent", "auth.json"),
  models: join(dataDir, "pi-agent", "models.json"),
  /** Per-session working directories (uploads land here). */
  workspaces: join(dataDir, "workspaces"),
  /** Pi session JSONL files. */
  sessions: join(dataDir, "sessions"),
  /** Our own session index. */
  sessionIndex: join(dataDir, "sessions.json"),
};

export function ensureDirs(): void {
  for (const dir of [paths.dataDir, paths.agentDir, paths.workspaces, paths.sessions]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function loadConfig(): ServerConfig {
  ensureDirs();
  if (existsSync(paths.config)) {
    const config = JSON.parse(readFileSync(paths.config, "utf8")) as ServerConfig;
    if (process.env.MENTOR_PORT) config.port = Number(process.env.MENTOR_PORT);
    if (process.env.MENTOR_HOST) config.host = process.env.MENTOR_HOST;
    return config;
  }
  const config: ServerConfig = {
    token: generateToken(),
    host: process.env.MENTOR_HOST ?? "0.0.0.0",
    port: Number(process.env.MENTOR_PORT ?? 8787),
    createdAt: new Date().toISOString(),
    defaultThinkingLevel: "medium",
  };
  saveConfig(config);
  return config;
}

export function saveConfig(config: ServerConfig): void {
  ensureDirs();
  writeFileSync(paths.config, JSON.stringify(config, null, 2) + "\n", "utf8");
}
