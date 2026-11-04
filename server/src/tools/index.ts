import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { buildWebTools } from "./web.js";
import { buildDocumentTools } from "./docs.js";

/** The education toolset, scoped to one session workspace. */
export function buildTools(workspace: string): ToolDefinition[] {
  return [...buildWebTools(), ...buildDocumentTools(workspace)];
}
