import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { buildWebTools } from "./web.js";
import { buildDocumentTools } from "./docs.js";
import { buildTodoTool } from "./todos.js";
import { buildShareTool } from "./share.js";
import { buildAskTool, type QuestionBroker } from "./ask.js";

/** The education toolset, scoped to one session workspace. */
export function buildTools(workspace: string, questions: QuestionBroker): ToolDefinition[] {
  return [
    ...buildWebTools(),
    ...buildDocumentTools(workspace),
    buildTodoTool(),
    buildShareTool(workspace),
    buildAskTool(questions),
  ];
}
