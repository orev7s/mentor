import { type DiffFile, diffText, parsePatch } from "@/lib/chatcn-diff"
import { type ChatcnMessage, type ChatcnToolPart, getToolName, isToolPart } from "@/lib/chatcn-types"
import { type TodoItem } from "@/components/ui/chatcn/todo-list"
import { type CodingWorkspace } from "./mentor-agent-types"

export const EDIT_TOOLS = new Set(["edit_file", "edit", "str_replace", "apply_patch", "multi_edit"])
export const WRITE_TOOLS = new Set(["write_file", "write", "create_file"])
export const SHELL_TOOLS = new Set(["bash", "shell", "run_command", "terminal", "exec_command"])
export const TODO_TOOLS = new Set(["todo_write", "todowrite", "write_todos", "update_todos"])
export const TODO_CLEAR_TOOLS = new Set(["todo_clear", "clear_todos"])
export const READ_TOOLS = new Set(["read_file", "read", "view", "open_file", "cat"])

export const toolKey = (part: ChatcnToolPart) =>
  getToolName(part)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase()
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function str(value: unknown, ...keys: string[]) {
  const r = record(value)
  for (const key of keys) if (typeof r[key] === "string") return r[key] as string
  return undefined
}

const TODO_STATUS: Record<string, TodoItem["status"]> = {
  pending: "pending",
  in_progress: "in-progress",
  "in-progress": "in-progress",
  completed: "done",
  done: "done",
  blocked: "blocked",
  skipped: "skipped",
  failed: "failed",
  cancelled: "cancelled",
}

/** Claude Code TodoWrite input (`content`, `activeForm`, `status`) or chatcn `TodoItem`s. */
export function todosFrom(input: unknown): TodoItem[] {
  const list = record(input).todos ?? record(input).items
  if (!Array.isArray(list)) return []
  return list.flatMap((raw, i) => {
    const t = record(raw)
    const title = str(t, "content", "title", "text")
    if (!title) return []
    return [
      {
        id: str(t, "id") ?? String(i),
        title,
        activeTitle: str(t, "activeForm", "activeTitle"),
        status: TODO_STATUS[str(t, "status") ?? "pending"] ?? "pending",
      },
    ]
  })
}

/** The file change a tool call makes, or nothing if it is not an edit (or was refused). */
function fileChange(part: ChatcnToolPart): DiffFile | undefined {
  const key = toolKey(part)
  if (part.state === "output-denied" || part.state === "output-error") return undefined
  const input = part.input
  const path = str(input, "path", "file", "filePath", "file_path")
  if (!path) return undefined
  const streaming = part.state === "input-streaming"
  if (EDIT_TOOLS.has(key)) {
    const patch = str(input, "diff", "patch") ?? str(part.output, "diff")
    if (patch) return parsePatch(patch, { path, streaming })[0]
    const oldText = str(input, "old", "old_string", "oldText", "search")
    const newText = str(input, "new", "new_string", "newText", "replace")
    if (oldText !== undefined && newText !== undefined) return diffText(oldText, newText, { path })
    return undefined
  }
  if (WRITE_TOOLS.has(key)) {
    const content = str(input, "content", "text", "contents")
    if (content === undefined) return undefined
    return { ...diffText("", content, { path, status: "added" }), complete: !streaming }
  }
  return undefined
}

function mergeFile(a: DiffFile, b: DiffFile): DiffFile {
  return {
    ...a,
    status: a.status === "added" ? "added" : b.status,
    hunks: [...a.hunks, ...b.hunks],
    additions: a.additions + b.additions,
    deletions: a.deletions + b.deletions,
    complete: b.complete,
    source: undefined,
  }
}

/**
 * Builds the workspace from the thread: changed files from edit and write calls, plus the latest
 * todo list. Pure, so it can run on every render. Bash calls stay in the thread as tool rows;
 * the app has no separate terminal view.
 */
export function codingWorkspaceFromMessages(messages: ChatcnMessage[]): CodingWorkspace {
  const files = new Map<string, DiffFile>()
  const pending = new Set<string>()
  const streaming = new Set<string>()
  let todos: TodoItem[] = []
  let activity: CodingWorkspace["activity"]

  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (!isToolPart(part)) continue
      const key = toolKey(part)
      if (TODO_TOOLS.has(key)) {
        const next = todosFrom(part.input)
        if (next.length) todos = next
        continue
      }
      if (TODO_CLEAR_TOOLS.has(key)) {
        todos = []
        continue
      }
      const change = fileChange(part)
      if (!change) continue
      const prev = files.get(change.path)
      files.set(change.path, prev ? mergeFile(prev, change) : change)
      if (part.state === "approval-requested") pending.add(change.path)
      if (part.state === "input-streaming") streaming.add(change.path)
      activity = { key: `${part.toolCallId}`, tab: "changes", path: change.path }
    }
  }

  return {
    files: [...files.values()],
    pendingPaths: [...pending],
    streamingPaths: [...streaming],
    todos,
    activity,
  }
}
