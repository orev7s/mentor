import * as React from "react"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { TaskStatusGlyph } from "@/components/ui/chatcn/task"
import { TodoList, type TodoItem } from "@/components/ui/chatcn/todo-list"
import { toolBashRenderers } from "@/components/ui/chatcn/tool-bash"
import { toolFileEditRenderers } from "@/components/ui/chatcn/tool-file-edit"
import { toolFileReadRenderers } from "@/components/ui/chatcn/tool-file-read"
import { toolFileWriteRenderers } from "@/components/ui/chatcn/tool-file-write"
import { toolMcpRenderers } from "@/components/ui/chatcn/tool-mcp"
import { toolSearchCodeRenderers } from "@/components/ui/chatcn/tool-search-code"
import { toolWebFetchRenderers } from "@/components/ui/chatcn/tool-web-fetch"
import { toolWebSearchRenderers } from "@/components/ui/chatcn/tool-web-search"
import {
  CircleCheckIcon,
  DownloadIcon,
  FileTextIcon,
  ListChecksIcon,
} from "@/lib/chatcn-icons"
import {
  type ChatcnActions,
  type ChatcnToolPart,
  isTerminalToolState,
} from "@/lib/chatcn-types"
import { formatBytes } from "@/lib/api"
import { cn } from "@/lib/utils"
import { record, str, todosFrom } from "./mentor-workspace"
import {
  type AskAnswerInput,
  type AskQuestionInput,
  type CodingAgentProps,
} from "./mentor-agent-types"

/** A todo update in the thread: the plan, then one short row per step finished. */
export function ToolTodoWritePart(props: ToolRendererProps) {
  const updates = React.useContext(TodoUpdateContext)
  const update = updates.get(props.part.toolCallId)
  const items = todosFrom(props.part.input)
  const done = items.filter((t) => t.status === "done").length
  const first = !update || update.first

  // Every update after the plan becomes a compact marker at the point it happened,
  // so the trace reads thought, completed step, thought, completed step.
  if (!first && update.changed.length) {
    const completed = update.completed.length > 0
    const detail =
      update.changed.length === 1 ? update.changed[0].title : `${update.done} of ${update.total} done`
    return (
      <ToolCall
        {...toolBasePropsFromPart(props)}
        name="todo_write"
        icon={completed ? <CircleCheckIcon /> : <ListChecksIcon />}
        title={completed ? "Completed" : "Started"}
        detail={detail}
      >
        <ul className="flex flex-col gap-1 px-1 pb-1.5">
          {update.changed.map((item) => (
            <li key={item.id} data-slot="todo-step" className="flex min-w-0 items-center gap-2.5">
              <TaskStatusGlyph status={item.status} />
              <span
                className={cn(
                  "chatcn-text-13 min-w-0 truncate",
                  item.status === "done" &&
                    "text-chatcn-fg-subtle line-through decoration-1 decoration-chatcn-fg-faint",
                )}
              >
                {item.title}
              </span>
            </li>
          ))}
        </ul>
      </ToolCall>
    )
  }

  // A re-sent list with no status change adds nothing to the thread.
  if (!first) return null

  return (
    <ToolCall
      {...toolBasePropsFromPart(props)}
      name="todo_write"
      icon={<ListChecksIcon />}
      title={done === 0 ? "Planned" : "Updated todos"}
      detail={
        items.length
          ? done === 0
            ? `${items.length} ${items.length === 1 ? "todo" : "todos"}`
            : `${done} of ${items.length} done`
          : undefined
      }
    >
      {items.length ? <TodoList items={items} variant="compact" /> : undefined}
    </ToolCall>
  )
}

/**
 * A cleared plan: the pinned list is gone, and the trace keeps one quiet row so
 * the student can see that it was cleared on purpose.
 */
export function ToolTodoClearPart(props: ToolRendererProps) {
  return (
    <ToolCall
      {...toolBasePropsFromPart(props)}
      name="todo_clear"
      icon={<ListChecksIcon />}
      title="Cleared the plan"
    />
  )
}

/**
 * The agent's multiple-choice questions. The tool call stays open while the
 * student picks answers; sending them resolves the waiting tool on the server
 * and the agent carries on in the same run.
 */
export function ToolAskStudentPart(props: ToolRendererProps) {
  const { onAnswerQuestions } = React.useContext(PartContext)
  const input = record(props.part.input)
  const intro = str(input, "intro")
  const rawQuestions = Array.isArray(input.questions) ? input.questions : []
  const questions: AskQuestionInput[] = rawQuestions.flatMap((raw) => {
    const item = record(raw)
    const question = str(item, "question")
    const options = Array.isArray(item.options)
      ? item.options.filter((option): option is string => typeof option === "string")
      : []
    if (!question || options.length < 2) return []
    return [{ question, options, allowMultiple: item.allowMultiple === true }]
  })

  const output = record(props.part.output)
  const saved = Array.isArray(output.answers)
    ? (output.answers as AskAnswerInput[]).filter((answer) => Array.isArray(answer?.selected))
    : null

  const [selected, setSelected] = React.useState<Record<number, string[]>>({})
  const [sent, setSent] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!questions.length) return null

  const chosen = (index: number) =>
    saved?.[index]?.selected ?? selected[index] ?? []
  const answered = questions.filter((_, index) => chosen(index).length > 0).length
  const closed = Boolean(saved) || sent || isTerminalToolState(props.part.state)
  const ready = answered === questions.length && Boolean(onAnswerQuestions)

  const pick = (index: number, option: string, multiple?: boolean) => {
    if (closed) return
    setError(null)
    setSelected((prev) => {
      const current = prev[index] ?? []
      if (multiple) {
        const next = current.includes(option)
          ? current.filter((value) => value !== option)
          : [...current, option]
        return { ...prev, [index]: next }
      }
      return { ...prev, [index]: [option] }
    })
  }

  const submit = async () => {
    if (!ready || closed || sending) return
    setSending(true)
    setError(null)
    try {
      await onAnswerQuestions?.(
        props.part.toolCallId,
        questions.map((question, index) => ({
          question: question.question,
          selected: chosen(index),
        })),
      )
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the answers.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      data-slot="ask-student"
      className="border-chatcn-border bg-chatcn-card shadow-chatcn-sm rounded-chatcn-lg overflow-hidden border"
    >
      <div className="border-chatcn-border flex items-center gap-2 border-b px-3.5 py-2.5">
        <CircleCheckIcon className="text-chatcn-fg-muted size-4 shrink-0" />
        <span className="chatcn-text-13 text-chatcn-fg min-w-0 flex-1 truncate font-medium">
          {intro?.trim() || "A quick check"}
        </span>
        <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
          {answered}/{questions.length} answered
        </span>
      </div>

      <div className="flex flex-col gap-4 px-3.5 py-3">
        {questions.map((question, index) => (
          <div
            key={`${question.question}-${index}`}
            data-slot="ask-question"
            className="flex flex-col gap-2"
          >
            <p className="chatcn-text-14 text-chatcn-fg font-medium text-pretty">
              {index + 1}. {question.question}
            </p>
            <div className="flex flex-col gap-1">
              {question.options.map((option) => {
                const on = chosen(index).includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={closed}
                    aria-pressed={on}
                    data-question={index}
                    onClick={() => pick(index, option, question.allowMultiple)}
                    className={cn(
                      "chatcn-focus flex w-full min-w-0 items-center gap-2.5 rounded-chatcn-md border px-2.5 py-2 text-start transition-colors",
                      on
                        ? "border-chatcn-fg bg-chatcn-fill text-chatcn-fg"
                        : "border-chatcn-border text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg",
                      closed && "cursor-default",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border",
                        question.allowMultiple ? "rounded-[4px]" : "rounded-full",
                        on ? "border-chatcn-fg" : "border-chatcn-border-strong",
                      )}
                    >
                      {on ? (
                        question.allowMultiple ? (
                          <CircleCheckIcon className="size-3" />
                        ) : (
                          <span className="bg-chatcn-fg size-1.5 rounded-full" />
                        )
                      ) : null}
                    </span>
                    <span className="chatcn-text-13 min-w-0 flex-1 text-pretty">{option}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-chatcn-border flex items-center gap-2 border-t px-3.5 py-2.5">
        <span className="chatcn-text-12 text-chatcn-fg-subtle min-w-0 flex-1 truncate">
          {error ??
            (saved || sent
              ? "Sent to your tutor"
              : closed
                ? "This question is closed"
                : answered === questions.length
                  ? "Ready to send"
                  : "Pick one answer for each question")}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || closed || sending}
          className={cn(
            "chatcn-focus rounded-chatcn-md chatcn-text-12 flex h-8 shrink-0 items-center px-3 font-medium transition-colors",
            !ready || closed || sending
              ? "bg-chatcn-fill text-chatcn-fg-subtle"
              : "bg-chatcn-fg text-chatcn-bg hover:bg-chatcn-primary-hover",
          )}
        >
          {sending ? "Sending..." : saved || sent ? "Answers sent" : "Send answers"}
        </button>
      </div>
    </div>
  )
}

/** The agent handed the student one specific file: make the download the whole row. */
export function ToolShareFilePart(props: ToolRendererProps) {
  const { onDownloadFile } = React.useContext(PartContext)
  const input = (props.part.input ?? {}) as {
    path?: string
    label?: string
    description?: string
  }
  const output = (props.part.output ?? {}) as {
    path?: string
    label?: string
    description?: string
    size?: number
  }
  const path = input.path ?? output.path
  if (!path) return null
  const label = input.label ?? output.label ?? path.split("/").pop() ?? path
  const description = input.description ?? output.description
  return (
    <ToolCall
      {...toolBasePropsFromPart(props)}
      name="share_file"
      icon={<DownloadIcon />}
      title="File for you"
      detail={description ?? path}
      variant="card"
      defaultOpen
    >
      <button
        type="button"
        onClick={() => onDownloadFile?.(path)}
        className="border-chatcn-border bg-chatcn-bg-subtle hover:bg-chatcn-fill-hover rounded-chatcn-md flex w-full min-w-0 items-center gap-2.5 border p-2.5 text-start transition-colors"
      >
        <FileTextIcon className="text-chatcn-fg-subtle size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="chatcn-text-13 text-chatcn-fg block truncate font-medium">{label}</span>
          <span className="chatcn-text-12 text-chatcn-fg-subtle block truncate">
            {description ?? path}
            {typeof output.size === "number" ? ` · ${formatBytes(output.size)}` : ""}
          </span>
        </span>
        <span className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-sm chatcn-text-12 flex shrink-0 items-center gap-1 px-2 py-1 font-medium">
          <DownloadIcon className="size-3.5" />
          Download
        </span>
      </button>
    </ToolCall>
  )
}

export const defaultToolRenderers: ToolRendererMap = {
  ...toolWebSearchRenderers,
  ...toolWebFetchRenderers,
  ...toolSearchCodeRenderers,
  ...toolFileReadRenderers,
  ...toolFileEditRenderers,
  ...toolFileWriteRenderers,
  ...toolBashRenderers,
  ...toolMcpRenderers,
  todo_write: ToolTodoWritePart,
  TodoWrite: ToolTodoWritePart,
  write_todos: ToolTodoWritePart,
  todo_clear: ToolTodoClearPart,
  share_file: ToolShareFilePart,
  ask_student: ToolAskStudentPart,
}

export interface ReadGroup {
  leader: string
  parts: ChatcnToolPart[]
}

/** The change one `todo_write` makes relative to the last one in the same turn. */
export interface TodoUpdate {
  /** True for the first update of the turn: the plan itself, shown in full. */
  first: boolean
  /** Items that moved into done in this update. */
  completed: TodoItem[]
  /** Items that moved into in-progress in this update. */
  started: TodoItem[]
  /** Every item whose status changed in this update, in list order. */
  changed: TodoItem[]
  total: number
  done: number
}

export interface PartContextValue {
  renderers: ToolRendererMap
  /** Keep edits and commands folded: the workspace sheet holds the full view. */
  split?: boolean
  approve?: ChatcnActions["approve"]
  deny?: ChatcnActions["deny"]
  onOpenFile?: (path: string) => void
  onDownloadFile?: (path: string) => void
  onAnswerQuestions?: CodingAgentProps["onAnswerQuestions"]
}

export const PartContext = React.createContext<PartContextValue>({ renderers: defaultToolRenderers })
export const GroupContext = React.createContext<Map<string, ReadGroup>>(new Map())
export const TodoUpdateContext = React.createContext<Map<string, TodoUpdate>>(new Map())
