import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const STATUS = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("blocked"),
  Type.Literal("skipped"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);

/**
 * The plan the student sees pinned above the composer. The client derives the
 * pinned list from this tool call, so the tool only has to echo the list back.
 */
export function buildTodoTool() {
  return defineTool({
    name: "todo_write",
    label: "Write todos",
    description:
      "Write or update your plan for the current task. Send the whole list every time. Use it for any multi-step work (research, essay, revision plan, script or PDF), and update the statuses as you go.",
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          content: Type.String({ description: "Imperative form, e.g. 'Extract the key dates'" }),
          activeForm: Type.Optional(
            Type.String({ description: "Present continuous form, e.g. 'Extracting the key dates'" }),
          ),
          status: STATUS,
        }),
      ),
    }),
    execute: async (
      _id: string,
      params: { todos: { content: string; activeForm?: string; status: string }[] },
    ) => {
      const done = params.todos.filter((item) => item.status === "completed").length;
      return {
        content: [
          {
            type: "text" as const,
            text: `Plan updated: ${done} of ${params.todos.length} done.`,
          },
        ],
        details: { todos: params.todos, total: params.todos.length, done },
      };
    },
  });
}