import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { buildWebTools } from "./web.js";
import { buildDocumentTools } from "./docs.js";
import { buildTodoClearTool, buildTodoTool } from "./todos.js";
import { buildShareTool } from "./share.js";
import { buildAskTool, type QuestionBroker } from "./ask.js";
import { buildMemoryTool, memoryStore } from "./memory.js";

/** The education toolset, scoped to one session workspace. */
export function buildTools(workspace: string, questions: QuestionBroker): ToolDefinition[] {
  return [
    ...buildWebTools(),
    ...buildDocumentTools(workspace),
    buildTodoTool(),
    buildTodoClearTool(),
    buildShareTool(workspace),
    buildAskTool(questions),
    buildMemoryTool(memoryStore),
  ];
}
