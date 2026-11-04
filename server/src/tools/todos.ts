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
      "Write or update your plan for the current task. Send the whole list every time, with the real status of every item. Use it for any multi-step work (research, essay, revision plan, script or PDF). Call it when you start, again after each step (mark what is done, what is in progress, what is still pending), and one final time before your last answer so the pinned list matches what actually happened.",
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

/**
 * Removes the pinned plan once the task is over. The client treats this as the
 * end of the list, so the todo card disappears instead of lingering with items
 * that are no longer relevant.
 */
export function buildTodoClearTool() {
  return defineTool({
    name: "todo_clear",
    label: "Clear todos",
    description:
      "Clear the plan completely. Use it when a multi-step task is finished and the plan is no longer useful, or when the student changes direction and the old list would be misleading. Call todo_write one last time first if you want the final statuses to be seen.",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: "text" as const, text: "Plan cleared." }],
      details: { cleared: true },
    }),
  });
}