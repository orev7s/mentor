"use client"

import * as React from "react"
import { ChangedFiles } from "@/components/ui/chatcn/changed-files"
import { ContextMeter, type ContextMeterProps } from "@/components/ui/chatcn/context-meter"
import {
  Conversation,
  ConversationContent,
  useConversation,
} from "@/components/ui/chatcn/conversation"
import { DiffStat, DiffViewer } from "@/components/ui/chatcn/diff-viewer"
import { EmptyState } from "@/components/ui/chatcn/empty-state"
import { Markdown } from "@/components/ui/chatcn/markdown"
import { Message, MessageContent, MessageStatus } from "@/components/ui/chatcn/message"
import { MessageAction, MessageActionCopy, MessageActions } from "@/components/ui/chatcn/message-actions"
import { type MessagePartComponents, MessageParts } from "@/components/ui/chatcn/message-parts"
import {
  permissionModes as defaultPermissionModes,
  nextPermissionMode,
  PermissionMode,
  type PermissionModeOption,
} from "@/components/ui/chatcn/permission-mode"
import {
  PromptInput,
  PromptInputActions,
  PromptInputAttachButton,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ui/chatcn/prompt-input"
import { type QueuedMessage, QueuedMessages } from "@/components/ui/chatcn/queued-messages"
import { Reasoning, reasoningPropsFromPart } from "@/components/ui/chatcn/reasoning"
import { ResizableGroup, ResizableHandle, ResizablePanel } from "@/components/ui/chatcn/resizable"
import { RunStatus, type RunStatusValue } from "@/components/ui/chatcn/run-status"
import { ScrollToBottom } from "@/components/ui/chatcn/scroll-to-bottom"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { Terminal } from "@/components/ui/chatcn/terminal"
import { type TodoItem, TodoList } from "@/components/ui/chatcn/todo-list"
import { toolBashRenderers } from "@/components/ui/chatcn/tool-bash"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  renderToolPart,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { toolFileEditRenderers } from "@/components/ui/chatcn/tool-file-edit"
import { toolFileReadRenderers } from "@/components/ui/chatcn/tool-file-read"
import { toolFileWriteRenderers } from "@/components/ui/chatcn/tool-file-write"
import { toolMcpRenderers } from "@/components/ui/chatcn/tool-mcp"
import { toolSearchCodeRenderers } from "@/components/ui/chatcn/tool-search-code"
import { toolWebFetchRenderers } from "@/components/ui/chatcn/tool-web-fetch"
import { toolWebSearchRenderers } from "@/components/ui/chatcn/tool-web-search"
import { TooltipProvider } from "@/components/ui/chatcn/tooltip"
import { Trace, TraceStep } from "@/components/ui/chatcn/trace"
import { TraceGroup } from "@/components/ui/chatcn/trace-group"
import { type DiffFile, diffStats, diffText, parsePatch } from "@/lib/chatcn-diff"
import {
  ArtifactIcon,
  ChevronDownIcon,
  DiffIcon,
  DownloadIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  GitForkIcon,
  ImageIcon,
  ListChecksIcon,
  MessageSquareIcon,
  ModelIcon,
  PanelRightIcon,
  RefreshCwIcon,
  SettingsIcon,
  SquareTerminalIcon,
  XIcon,
} from "@/lib/chatcn-icons"
import {
  type ChatcnActions,
  type ChatcnMessage,
  type ChatcnPart,
  type ChatcnTextPart,
  type ChatcnToolPart,
  getToolName,
  isTerminalToolState,
  isToolPart,
} from "@/lib/chatcn-types"
import { type Attachment, formatBytes, type WorkspaceFile } from "@/lib/api"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

/** Request status, identical to AI SDK `useChat().status`. */
type CodingAgentStatus = "ready" | "submitted" | "streaming" | "error"

/** The workspace tabs. On narrow screens they sit next to Chat in one tab bar. */
type CodingWorkspaceTab = "changes" | "terminal" | "files"

/** The shell session the agent drives, as one stream of text with escape codes. */
interface CodingTerminalState {
  /** Every command with its output, prompts included. */
  text: string
  /** The command running now, or the last one. */
  command?: string
  cwd?: string
  running: boolean
  exitCode?: number | null
}

/** Everything the workspace shows, derived from the tool calls in the thread. */
interface CodingWorkspace {
  /** One entry per path, edits to the same file merged in order. */
  files: DiffFile[]
  /** Paths whose edit is waiting on an approval. */
  pendingPaths: string[]
  /** Paths whose patch is still streaming in. */
  streamingPaths: string[]
  terminal: CodingTerminalState
  /** The latest todo list the agent wrote. */
  todos: TodoItem[]
  /**
   * What the agent touched last, so the workspace can follow it: a changing `key` moves to
   * `tab` (and selects `path` on Changes).
   */
  activity?: { key: string; tab: CodingWorkspaceTab; path?: string }
}

/** Context window numbers for the meter in the composer. */
type CodingAgentContext = Pick<
  ContextMeterProps,
  "limit" | "used" | "breakdown" | "model" | "compacted" | "onCompact" | "warnAt"
>

interface CodingAgentProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** The thread, in the chatcn contract. AI SDK `UIMessage` works as is. */
  messages: ChatcnMessage[]
  /** Same values as `useChat().status`. Defaults to `ready`. */
  status?: CodingAgentStatus
  /** send, stop, approve and deny. Missing ones hide their controls. */
  actions?: ChatcnActions

  /** Header title. Defaults to the first line of the first user message. */
  title?: React.ReactNode
  /** Git branch the agent works on, shown in the header. */
  branch?: string
  /** Model name, shown in the header and the context meter. */
  model?: string
  /** Extra controls at the end of the header. */
  headerActions?: React.ReactNode

  /**
   * Show the files/changes/terminal pane beside the chat. Controlled or uncontrolled.
   * On tablet and desktop the header carries a button that folds it away.
   */
  workspaceOpen?: boolean
  defaultWorkspaceOpen?: boolean
  onWorkspaceOpenChange?: (open: boolean) => void

  /** Model name shown in the composer chip. */
  composerModel?: string
  /** Opens the model picker from the composer. */
  onOpenModels?: () => void
  /** Opens providers and settings from the composer. */
  onOpenSettings?: () => void

  /** Override the derived workspace. Each key replaces only its own part. */
  workspace?: Partial<CodingWorkspace>
  /** Tool name to renderer. Defaults to every chatcn tool renderer plus `todo_write`. */
  toolRenderers?: ToolRendererMap

  /** Workspace tab. Controlled or uncontrolled. */
  workspaceTab?: CodingWorkspaceTab
  defaultWorkspaceTab?: CodingWorkspaceTab
  onWorkspaceTabChange?: (tab: CodingWorkspaceTab) => void
  /**
   * Move the workspace to whatever the agent touches: a streaming edit opens Changes on that
   * file, a command opens Terminal. Picking a tab or file yourself pauses it until the next
   * message you send. Defaults to true.
   */
  followActivity?: boolean

  /** Permission modes for the composer. Shift+Tab in the message field cycles them. */
  permissionModes?: PermissionModeOption[]
  permissionMode?: string
  defaultPermissionMode?: string
  onPermissionModeChange?: (mode: string) => void

  /** Context window usage. No meter without it. */
  context?: CodingAgentContext

  /**
   * Messages sent while the agent works wait here and go out, joined, when the run ends.
   * Controlled or uncontrolled.
   */
  queue?: QueuedMessage[]
  defaultQueue?: QueuedMessage[]
  onQueueChange?: (queue: QueuedMessage[]) => void

  /** Composer placeholder while idle. */
  placeholder?: string
  /** Composer placeholder while the agent works. */
  queuePlaceholder?: string
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode

  /** Files the student attached but has not sent yet. */
  attachments?: Attachment[]
  /** Files from the attach button, paste or drop. */
  onAttachFiles?: (files: File[]) => void
  onRemoveAttachment?: (path: string) => void

  /** Branch the conversation at a message, seeding a new chat with the turns before it. */
  onForkMessage?: (message: ChatcnMessage) => void

  /** Everything in the session workspace: uploads plus anything the agent wrote. */
  files?: WorkspaceFile[]
  onOpenFile?: (path: string) => void
  onDownloadFile?: (path: string) => void
  onRefreshFiles?: () => void

  /** Starter prompts on the first screen. Up to four. */
  suggestions?: { label: string; prompt?: string }[]
  onSuggestion?: (prompt: string) => void

  /** Fill the viewport. Otherwise the block fills its parent: give the parent a height. */
  fullHeight?: boolean
  /** Container width in px at which the two panes sit side by side. Defaults to 900. */
  splitAt?: number
}

/* -------------------------------------------------------------------------------------------------
 * Deriving the workspace from tool calls
 * -----------------------------------------------------------------------------------------------*/

const EDIT_TOOLS = new Set(["edit_file", "edit", "str_replace", "apply_patch", "multi_edit"])
const WRITE_TOOLS = new Set(["write_file", "write", "create_file"])
const SHELL_TOOLS = new Set(["bash", "shell", "run_command", "terminal", "exec_command"])
const TODO_TOOLS = new Set(["todo_write", "todowrite", "write_todos", "update_todos"])
const READ_TOOLS = new Set(["read_file", "read", "view", "open_file", "cat"])

const toolKey = (part: ChatcnToolPart) =>
  getToolName(part)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase()

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function str(value: unknown, ...keys: string[]) {
  const r = record(value)
  for (const key of keys) if (typeof r[key] === "string") return r[key] as string
  return undefined
}

function num(value: unknown, ...keys: string[]) {
  const r = record(value)
  for (const key of keys) if (typeof r[key] === "number") return r[key] as number
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
function todosFrom(input: unknown): TodoItem[] {
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

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`

/**
 * Builds the workspace from the thread: changed files from edit and write calls, the shell
 * session from command calls, and the latest todo list. Pure, so it can run on every render.
 */
function codingWorkspaceFromMessages(messages: ChatcnMessage[]): CodingWorkspace {
  const files = new Map<string, DiffFile>()
  const pending = new Set<string>()
  const streaming = new Set<string>()
  let todos: TodoItem[] = []
  let text = ""
  let command: string | undefined
  let cwd: string | undefined
  let running = false
  let exitCode: number | null | undefined
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
      if (SHELL_TOOLS.has(key)) {
        const cmd = str(part.input, "command", "cmd", "script")
        if (!cmd || part.state === "input-streaming" || part.state === "output-denied") continue
        const output = part.output
        const out = typeof output === "string" ? output : (str(output, "stdout", "output") ?? "")
        const err = str(output, "stderr") ?? (part.state === "output-error" ? part.errorText : "")
        cwd = str(part.input, "cwd", "workdir") ?? cwd
        command = cmd
        running = !isTerminalToolState(part.state) || part.preliminary === true
        exitCode = running ? undefined : (num(output, "exitCode", "exit_code", "code") ?? null)
        if (part.state === "output-error" && exitCode === null) exitCode = 1
        const body = `${out}${err ? (out.endsWith("\n") || !out ? "" : "\n") + err : ""}`
        text += `${text ? "\n" : ""}${dim(cwd ?? "~")} ${bold(`$ ${cmd}`)}\n${body}`
        if (!body.endsWith("\n") && body) text += "\n"
        activity = { key: `${part.toolCallId}`, tab: "terminal" }
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
    terminal: { text, command, cwd, running, exitCode },
    todos,
    activity,
  }
}

/* -------------------------------------------------------------------------------------------------
 * Thread pieces
 * -----------------------------------------------------------------------------------------------*/

/** A todo update in the thread: one quiet row, the list itself one click away. */
function ToolTodoWritePart(props: ToolRendererProps) {
  const items = todosFrom(props.part.input)
  const done = items.filter((t) => t.status === "done").length
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

const defaultToolRenderers: ToolRendererMap = {
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
  share_file: ToolShareFilePart,
}

interface ReadGroup {
  leader: string
  parts: ChatcnToolPart[]
}

/**
 * Runs of two or more consecutive file reads collapse into one trace line, "Read 4 files", so
 * the thread keeps to what changed. Keyed by tool call id: leaders render the group, the rest
 * render nothing.
 */
function readGroups(message: ChatcnMessage) {
  const groups = new Map<string, ReadGroup>()
  let run: ChatcnToolPart[] = []
  const flush = () => {
    if (run.length >= 2) {
      const group = { leader: run[0]?.toolCallId ?? "", parts: run }
      for (const p of run) groups.set(p.toolCallId, group)
    }
    run = []
  }
  for (const part of message.parts) {
    if (part.type === "step-start") continue
    if (isToolPart(part) && READ_TOOLS.has(toolKey(part)) && part.state !== "approval-requested")
      run.push(part)
    else flush()
  }
  flush()
  // The todo list is pinned above the composer, so only the first update in a turn shows here.
  const todoParts = message.parts.filter(
    (p): p is ChatcnToolPart => isToolPart(p) && TODO_TOOLS.has(toolKey(p)),
  )
  for (const p of todoParts.slice(1)) groups.set(p.toolCallId, { leader: "", parts: [] })
  return groups
}

interface PartContextValue {
  renderers: ToolRendererMap
  /** The workspace is on screen: edits and commands stay folded in the thread, the diff and the terminal are right there. */
  split?: boolean
  approve?: ChatcnActions["approve"]
  deny?: ChatcnActions["deny"]
  onOpenFile?: (path: string) => void
  onDownloadFile?: (path: string) => void
}

const PartContext = React.createContext<PartContextValue>({ renderers: defaultToolRenderers })
const GroupContext = React.createContext<Map<string, ReadGroup>>(new Map())

function ReadGroupRow({ group, stopped }: { group: ReadGroup; stopped: boolean }) {
  const parts = group.parts
  const active = parts.find((p) => !isTerminalToolState(p.state))
  const running = Boolean(active) && !stopped
  const path = (p: ChatcnToolPart) => str(p.input, "path", "file", "filePath", "file_path") ?? ""
  const n = parts.length
  return (
    <Trace className="-mx-0">
      <TraceGroup
        status={running ? "running" : stopped && active ? "cancelled" : "done"}
        title={`Read ${n} files`}
        activeTitle={`Reading ${n} files`}
        current={active ? path(active) : undefined}
        icon={<FileTextIcon />}
      >
        {parts.map((p) => (
          <TraceStep
            key={p.toolCallId}
            status={isTerminalToolState(p.state) ? "done" : stopped ? "cancelled" : "running"}
            detail={path(p)}
          />
        ))}
      </TraceGroup>
    </Trace>
  )
}

/** Keeps following after an approval row closes and the thread gets shorter. */
function useFollowAfterApproval(state: string) {
  const conversation = useConversation()
  const wasFollowing = React.useRef(false)
  const previous = React.useRef(state)
  if (state === "approval-requested") wasFollowing.current = conversation?.isAtBottom ?? false
  React.useEffect(() => {
    const was = previous.current
    previous.current = state
    if (was !== "approval-requested" || state === "approval-requested" || !wasFollowing.current)
      return
    const id = window.setTimeout(() => conversation?.scrollToBottom({ behavior: "smooth" }), 120)
    return () => window.clearTimeout(id)
  }, [state, conversation])
}

const AgentTool: MessagePartComponents["tool"] = ({ part, stopped }) => {
  const { renderers, approve, deny, split } = React.useContext(PartContext)
  const groups = React.useContext(GroupContext)
  const [open, setOpen] = React.useState(false)
  useFollowAfterApproval(part.state)
  const key = toolKey(part)
  const folded = split && (EDIT_TOOLS.has(key) || WRITE_TOOLS.has(key) || SHELL_TOOLS.has(key))
  const group = groups.get(part.toolCallId)
  if (group) {
    return group.leader === part.toolCallId ? (
      <ReadGroupRow group={group} stopped={stopped} />
    ) : null
  }
  return renderToolPart(part, renderers, {
    stopped,
    variant: "inline",
    onApprove: approve ? (id, scope) => void approve(id, { scope }) : undefined,
    onDeny: deny ? (id, reason) => void deny(id, reason) : undefined,
    ...(folded ? { open, onOpenChange: setOpen } : {}),
  })
}

const AgentReasoning: MessagePartComponents["reasoning"] = ({ part, streaming }) => (
  <Reasoning
    {...reasoningPropsFromPart(part)}
    state={streaming ? "streaming" : "done"}
    className="-mx-2"
  />
)

const partComponents: Partial<MessagePartComponents> = {
  tool: AgentTool,
  reasoning: AgentReasoning,
  "data-artifacts": ArtifactsPart,
}

const renderMarkdown = (text: string, { streaming }: { streaming: boolean }) => (
  <Markdown streaming={streaming}>{text}</Markdown>
)

function messageText(message: ChatcnMessage) {
  return message.parts
    .filter((p): p is ChatcnTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim()
}

const AgentMessage = React.memo(function AgentMessage({
  message,
  streaming,
  stopped,
  latest,
  onFork,
}: {
  message: ChatcnMessage
  streaming: boolean
  stopped: boolean
  latest: boolean
  onFork?: (message: ChatcnMessage) => void
}) {
  const groups = React.useMemo(() => readGroups(message), [message])
  const text = messageText(message)
  const fork = onFork ? (
    <MessageAction label="Fork from here" onClick={() => onFork(message)}>
      <GitForkIcon className="size-4" />
    </MessageAction>
  ) : null

  if (message.role !== "assistant") {
    return (
      <Message
        from={message.role}
        layout="flat"
        latest={latest}
        className="items-center"
      >
        <MessageContent className="chatcn-text-15 bg-chatcn-fill rounded-chatcn-xl w-fit max-w-[85%] px-4 py-2.5 text-start">
          {text}
        </MessageContent>
        <MessageActions className="ms-0 justify-center">
          <MessageActionCopy value={text} label="Copy message" />
          {fork}
        </MessageActions>
      </Message>
    )
  }
  const waiting = message.parts.some((p) => isToolPart(p) && p.state === "approval-requested")
  return (
    <Message
      from="assistant"
      state={streaming ? "streaming" : stopped ? "stopped" : "done"}
      latest={latest}
      announce={false}
      className="items-center"
    >
      <MessageContent>
        <GroupContext.Provider value={groups}>
          <MessageParts
            message={message}
            streaming={streaming}
            stopped={stopped}
            renderText={renderMarkdown}
            components={partComponents}
            toolVariant="inline"
          />
        </GroupContext.Provider>
      </MessageContent>
      <MessageStatus />
      {!streaming && !waiting && text ? (
        <MessageActions className="justify-center">
          <MessageActionCopy value={text} label="Copy response" />
          {fork}
        </MessageActions>
      ) : null}
    </Message>
  )
})

/* -------------------------------------------------------------------------------------------------
 * Layout helpers
 * -----------------------------------------------------------------------------------------------*/

/** Width of an element, measured before paint so the first frame already has the right layout. */
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState<number>()
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Layout width, not the transformed box, so a scaled parent never flips the layout.
    setWidth(el.offsetWidth)
    const observer = new ResizeObserver(() => setWidth(el.offsetWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [state, setState] = React.useState(defaultValue)
  const current = value ?? state
  const set = React.useCallback(
    (next: T) => {
      if (value === undefined) setState(next)
      onChange?.(next)
    },
    [value, onChange],
  )
  return [current, set] as const
}

interface TabDef<T extends string> {
  id: T
  label: string
  icon: React.ReactNode
  badge?: React.ReactNode
}

/** A segmented tab bar. Arrow keys move between tabs; the panel is labelled by its tab. */
function TabBar<T extends string>({
  tabs,
  value,
  onValueChange,
  label,
  idBase,
  className,
  end,
}: {
  tabs: TabDef<T>[]
  value: T
  onValueChange: (value: T) => void
  label: string
  idBase: string
  className?: string
  end?: React.ReactNode
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const onKeyDown = (event: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    let next = -1
    if (event.key === "ArrowRight") next = (i + 1) % tabs.length
    else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    if (next < 0) return
    event.preventDefault()
    const tab = tabs[next] as TabDef<T>
    onValueChange(tab.id)
    refs.current[tab.id]?.focus()
  }
  return (
    <div
      data-slot="coding-agent-tabs"
      className={cn("flex min-w-0 shrink-0 items-center gap-2", className)}
    >
      <div
        role="tablist"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex min-w-0 items-center gap-0.5"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el
              }}
              type="button"
              role="tab"
              id={`${idBase}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idBase}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.id)}
              className={cn(
                "chatcn-focus rounded-chatcn-md chatcn-text-13 inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 font-medium",
                "ease-chatcn-out transition-[color,background-color] duration-150 pointer-coarse:h-11 pointer-coarse:px-3.5",
                "[&_svg]:size-3.5 [&_svg]:shrink-0",
                selected
                  ? "bg-chatcn-fill text-chatcn-fg"
                  : "text-chatcn-fg-subtle hover:text-chatcn-fg hover:bg-chatcn-fill-hover",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null ? (
                <span className="chatcn-text-12 text-chatcn-fg-subtle font-normal tabular-nums">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {end ? <div className="ms-auto flex min-w-0 items-center gap-2">{end}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Workspace views
 * -----------------------------------------------------------------------------------------------*/

function QuietEmpty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="chatcn-text-14 text-chatcn-fg font-medium">{title}</p>
      <p className="chatcn-text-13 text-chatcn-fg-subtle max-w-64 text-pretty">{children}</p>
    </div>
  )
}

function ChangesView({
  workspace,
  selected,
  onSelect,
}: {
  workspace: CodingWorkspace
  selected: string | null
  onSelect: (path: string) => void
}) {
  const { files, streamingPaths, pendingPaths } = workspace
  const file = files.find((f) => f.path === selected) ?? files.at(-1)
  if (!file) {
    return (
      <QuietEmpty title="No changes yet">
        Edits the agent makes land here as diffs you can read before you commit.
      </QuietEmpty>
    )
  }
  const pending = pendingPaths.includes(file.path)
  return (
    <div className="@container/changes flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col @2xl/changes:flex-row">
        <div className="border-chatcn-border chatcn-scroll flex max-h-[38%] shrink-0 flex-col overflow-y-auto border-b p-2 @2xl/changes:max-h-none @2xl/changes:w-80 @2xl/changes:border-e @2xl/changes:border-b-0">
          <ChangedFiles
            files={files.map(({ path, oldPath, status, additions, deletions }) => ({
              path,
              oldPath,
              status,
              additions,
              deletions,
            }))}
            value={file.path}
            onValueChange={onSelect}
            title={null}
          />
        </div>
        <div className="chatcn-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {pending ? (
            <p className="chatcn-text-12 text-chatcn-fg-muted border-chatcn-border flex h-9 shrink-0 items-center gap-2 border-b px-4">
              <span
                className="bg-chatcn-fg-subtle size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              Waiting for your approval in the chat
            </p>
          ) : null}
          <DiffViewer
            key={file.path}
            file={file}
            streaming={streamingPaths.includes(file.path)}
            variant="plain"
            className="min-w-0"
          />
        </div>
      </div>
    </div>
  )
}

function TerminalView({ terminal }: { terminal: CodingTerminalState }) {
  if (!terminal.text) {
    return (
      <QuietEmpty title="No commands yet">
        Tests, builds and scripts the agent runs stream here as they happen.
      </QuietEmpty>
    )
  }
  return (
    <Terminal
      text={terminal.text}
      title="zsh"
      cwd={terminal.cwd}
      running={terminal.running}
      exitCode={terminal.running ? undefined : terminal.exitCode}
      maxHeight="none"
      className="bg-chatcn-bg-subtle min-h-0 flex-1 rounded-none shadow-none [&>section]:flex-1"
    />
  )
}

function reportIcon(kind: WorkspaceFile["kind"]) {
  if (kind === "pdf" || kind === "document") return <FileTextIcon />
  if (kind === "image") return <ImageIcon />
  if (kind === "code") return <FileCodeIcon />
  return <FileIcon />
}

/** The workspace as a file list: uploads, generated PDFs, notes, scripts and images. */
function FilesView({
  files,
  onOpen,
  onDownload,
  onRefresh,
}: {
  files: WorkspaceFile[]
  onOpen?: (path: string) => void
  onDownload?: (path: string) => void
  onRefresh?: () => void
}) {
  if (!files.length) {
    return (
      <QuietEmpty title="No files yet">
        Uploads and anything the agent writes land here: PDFs, notes, worksheets and scripts.
      </QuietEmpty>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-chatcn-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="chatcn-text-12 text-chatcn-fg-subtle">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <div className="flex-1" />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg ease-chatcn-standard flex h-7 items-center gap-1 px-1.5 transition-colors duration-150"
          >
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </button>
        ) : null}
      </div>
      <ul className="chatcn-scroll m-0 flex-1 list-none overflow-y-auto p-2">
        {files.map((file) => (
          <li key={file.path}>
            <div className="group hover:bg-chatcn-fill-hover rounded-chatcn-md flex min-w-0 items-center gap-2 px-2 py-1.5">
              <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-4">
                {reportIcon(file.kind)}
              </span>
              <button
                type="button"
                onClick={() => onOpen?.(file.path)}
                className="chatcn-focus flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
                title={file.path}
              >
                <span className="chatcn-text-13 text-chatcn-fg w-full truncate font-medium">
                  {file.path}
                </span>
                <span className="chatcn-text-12 text-chatcn-fg-subtle tabular-nums">
                  {formatBytes(file.size)} · {new Date(file.mtime).toLocaleDateString()}
                </span>
              </button>
              {onDownload ? (
                <button
                  type="button"
                  onClick={() => onDownload(file.path)}
                  aria-label={`Download ${file.path}`}
                  className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg flex size-7 shrink-0 items-center justify-center opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <DownloadIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The files a run produced, shown at the end of the reply with a download on each. */
function RunArtifacts({
  files,
  onOpen,
  onDownload,
}: {
  files: WorkspaceFile[]
  onOpen?: (path: string) => void
  onDownload?: (path: string) => void
}) {
  return (
    <div
      data-slot="run-artifacts"
      className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-lg overflow-hidden border"
    >
      <div className="border-chatcn-border flex h-9 items-center gap-2 border-b px-3">
        <ArtifactIcon className="text-chatcn-fg-subtle size-3.5 shrink-0" />
        <span className="chatcn-text-13 text-chatcn-fg font-medium">
          {files.length === 1 ? "1 file from this run" : `${files.length} files from this run`}
        </span>
      </div>
      <ul className="m-0 list-none divide-y divide-chatcn-border p-0">
        {files.map((file) => (
          <li key={file.path} className="flex min-w-0 items-center gap-2 px-3 py-2">
            <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-4">
              {reportIcon(file.kind)}
            </span>
            <button
              type="button"
              onClick={() => onOpen?.(file.path)}
              className="chatcn-focus flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
            >
              <span className="chatcn-text-13 text-chatcn-fg w-full truncate font-medium">
                {file.path}
              </span>
              <span className="chatcn-text-12 text-chatcn-fg-subtle">
                {formatBytes(file.size)}
              </span>
            </button>
            {onDownload ? (
              <button
                type="button"
                onClick={() => onDownload(file.path)}
                className="chatcn-focus border-chatcn-border text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg rounded-chatcn-sm flex h-7 shrink-0 items-center gap-1 border px-2 transition-colors"
              >
                <DownloadIcon className="size-3.5" />
                <span className="chatcn-text-12">Download</span>
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArtifactsPart({ part }: { part: ChatcnPart }) {
  const { onOpenFile, onDownloadFile } = React.useContext(PartContext)
  const data = (part as { data?: { files?: WorkspaceFile[] } }).data
  const files = data?.files ?? []
  if (!files.length) return null
  return <RunArtifacts files={files} onOpen={onOpenFile} onDownload={onDownloadFile} />
}

/** The agent handed the student one specific file: make the download the whole row. */
function ToolShareFilePart(props: ToolRendererProps) {
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

/* -------------------------------------------------------------------------------------------------
 * CodingAgent
 * -----------------------------------------------------------------------------------------------*/

let queueSeq = 0

/**
 * A coding agent workspace in the style of Claude Code and Cursor. The thread runs on the left
 * with reasoning, tool calls and approvals; the workspace on the right shows what the agent
 * changed (files and diffs) and the shell it drives. Todos pin above the composer, messages sent
 * mid run wait in a queue, and the composer carries the permission mode and the context meter.
 * Below 900 px of its own width it becomes one pane with Chat, Files and Terminal tabs.
 */
function MentorAgent({
  messages,
  status = "ready",
  actions = {},
  title,
  branch,
  model,
  headerActions,
  workspaceOpen: workspaceOpenProp,
  defaultWorkspaceOpen = true,
  onWorkspaceOpenChange,
  composerModel,
  onOpenModels,
  onOpenSettings,
  workspace: workspaceProp,
  toolRenderers = defaultToolRenderers,
  workspaceTab: tabProp,
  defaultWorkspaceTab = "files",
  onWorkspaceTabChange,
  followActivity = true,
  permissionModes = defaultPermissionModes,
  permissionMode: modeProp,
  defaultPermissionMode,
  onPermissionModeChange,
  context,
  queue: queueProp,
  defaultQueue = [],
  onQueueChange,
  placeholder = "Ask for a change…",
  queuePlaceholder = "Queue a message for when this run ends…",
  emptyTitle = "What should we change?",
  emptyDescription,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  onForkMessage,
  files: workspaceFiles = [],
  onOpenFile,
  onDownloadFile,
  onRefreshFiles,
  suggestions,
  onSuggestion,
  fullHeight = false,
  splitAt = 900,
  className,
  ...props
}: CodingAgentProps) {
  const id = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const width = useWidth(rootRef)
  const wide = width === undefined || width >= splitAt

  const busy = status === "submitted" || status === "streaming"
  const derived = React.useMemo(() => codingWorkspaceFromMessages(messages), [messages])
  const workspace: CodingWorkspace = { ...derived, ...workspaceProp }
  const { files, terminal, todos } = workspace

  const [tab, setTab] = useControllable(tabProp, defaultWorkspaceTab, onWorkspaceTabChange)
  const [workspaceOpen, setWorkspaceOpen] = useControllable(
    workspaceOpenProp,
    defaultWorkspaceOpen,
    onWorkspaceOpenChange,
  )
  const [view, setView] = React.useState<"chat" | CodingWorkspaceTab>("chat")
  const [selected, setSelected] = React.useState<string | null>(null)
  const [following, setFollowing] = React.useState(followActivity)

  // A fresh chat starts on Files: the first useful thing a tutor makes is a document.
  React.useEffect(() => {
    if (messages.length === 0) setTab("files")
  }, [messages.length, setTab])
  const [mode, setMode] = useControllable(
    modeProp,
    defaultPermissionMode ?? permissionModes[0]?.id ?? "ask",
    onPermissionModeChange,
  )
  const [queue, setQueue] = useControllable(queueProp, defaultQueue, onQueueChange)
  const [input, setInput] = React.useState("")
  const [stopped, setStopped] = React.useState<ReadonlySet<string>>(() => new Set())

  // Follow the agent: a new edit or command moves the workspace to it.
  const activityKey = workspace.activity?.key
  const activityRef = React.useRef(workspace.activity)
  activityRef.current = workspace.activity
  React.useEffect(() => {
    const activity = activityRef.current
    if (!activityKey || !activity || !following || !followActivity) return
    setTab(activity.tab)
    if (activity.path) setSelected(activity.path)
  }, [activityKey, following, followActivity, setTab])

  // When a run ends, everything queued goes out as the next message. The rows stay, marked as
  // sending, until that message shows up in the thread, so the hand-off reads as one motion.
  const wasBusy = React.useRef(busy)
  const queueRef = React.useRef(queue)
  queueRef.current = queue
  const [sentAt, setSentAt] = React.useState<number | null>(null)
  React.useEffect(() => {
    const ended = wasBusy.current && !busy
    wasBusy.current = busy
    if (!ended || status === "error" || !actions.send) return
    const due = queueRef.current.filter((m) => m.status !== "failed" && m.status !== "sending")
    if (!due.length) return
    const ids = new Set(due.map((m) => m.id))
    setSentAt(messages.length)
    setQueue(queueRef.current.map((m) => (ids.has(m.id) ? { ...m, status: "sending" } : m)))
    setFollowing(true)
    void actions.send(due.map((m) => m.text).join("\n\n"))
  }, [busy, status, actions, setQueue, messages.length])

  // Clear the sent rows once the thread has the new message, or after 4 s at the latest.
  React.useEffect(() => {
    if (sentAt === null) return
    const clear = () => {
      setSentAt(null)
      setQueue(queueRef.current.filter((m) => m.status !== "sending"))
    }
    if (messages.length > sentAt) {
      clear()
      return
    }
    const id = window.setTimeout(clear, 4000)
    return () => window.clearTimeout(id)
  }, [sentAt, messages.length, setQueue])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || !actions.send) return
    setInput("")
    if (busy) {
      setQueue([...queue, { id: `queued-${++queueSeq}`, text: trimmed, mode: "after-run" }])
      return
    }
    setFollowing(true)
    void actions.send(trimmed)
  }

  const stop = () => {
    const lastMessage = messages.at(-1)
    if (lastMessage?.role === "assistant") setStopped((set) => new Set(set).add(lastMessage.id))
    actions.stop?.()
  }

  const pickTab = (next: CodingWorkspaceTab) => {
    setFollowing(false)
    setTab(next)
  }
  const pickFile = (path: string) => {
    setFollowing(false)
    setSelected(path)
  }

  const partContext = React.useMemo<PartContextValue>(
    () => ({
      renderers: toolRenderers,
      approve: actions.approve,
      deny: actions.deny,
      split: wide,
      onOpenFile,
      onDownloadFile,
    }),
    [toolRenderers, actions.approve, actions.deny, wide, onOpenFile, onDownloadFile],
  )

  // Ctrl+` opens the terminal, the way editors do.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "`" && !event.isComposing) {
        event.preventDefault()
        setFollowing(false)
        setTab("terminal")
        setView("terminal")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setTab])

  const last = messages.at(-1)
  const liveId = busy && last?.role === "assistant" ? last.id : undefined
  const waiting = messages.some((m) =>
    m.parts.some((p) => isToolPart(p) && p.state === "approval-requested"),
  )
  const runStatus: RunStatusValue | undefined = waiting
    ? "waiting"
    : busy
      ? "running"
      : status === "error"
        ? "failed"
        : messages.length
          ? "done"
          : undefined
  const firstUser = messages.find((m) => m.role === "user")
  const heading = title ?? (firstUser ? messageText(firstUser).split("\n")[0] : "New session")
  const stats = diffStats(files)

  const header = (
    <header
      data-slot="coding-agent-header"
      className="border-chatcn-border flex h-12 shrink-0 items-center gap-3 border-b ps-4 pe-3"
    >
      <h1 className="chatcn-text-14 text-chatcn-fg min-w-0 flex-1 truncate font-medium">
        {heading}
      </h1>
      {wide && branch ? (
        <span className="chatcn-text-12 text-chatcn-fg-subtle flex min-w-0 items-center gap-1.5 font-mono [&_svg]:size-3.5 [&_svg]:shrink-0">
          <GitBranchIcon />
          <span className="truncate">{branch}</span>
        </span>
      ) : null}
      {wide && model ? (
        <span className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">{model}</span>
      ) : null}
      {runStatus ? (
        <RunStatus
          status={runStatus}
          label={runStatus === "waiting" ? "Needs approval" : undefined}
          variant="plain"
          showElapsed={runStatus !== "waiting"}
        />
      ) : null}
      {wide ? (
        <button
          type="button"
          onClick={() => setWorkspaceOpen(!workspaceOpen)}
          aria-label={workspaceOpen ? "Hide files and terminal" : "Show files and terminal"}
          aria-expanded={workspaceOpen}
          title={workspaceOpen ? "Hide files and terminal" : "Show files and terminal"}
          data-testid="workspace-toggle"
          className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 shrink-0 items-center justify-center transition-colors"
        >
          <PanelRightIcon className="size-4" />
        </button>
      ) : null}
      {headerActions}
    </header>
  )

  const thread =
    messages.length === 0 ? (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        suggestions={suggestions}
        onSuggestion={(prompt) => {
          if (onSuggestion) onSuggestion(prompt)
          else submit(prompt)
        }}
        className="flex-1 justify-center py-8"
      />
    ) : (
      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          label="Agent session"
          className="gap-7 px-4 pt-6 pb-6 @3xl/coding-agent:px-6"
          viewportClassName="[mask-image:linear-gradient(to_bottom,transparent,black_20px)]"
        >
          {messages.map((message, i) => (
            <AgentMessage
              key={message.id}
              message={message}
              streaming={message.id === liveId}
              stopped={stopped.has(message.id)}
              latest={i === messages.length - 1}
              onFork={onForkMessage}
            />
          ))}
        </ConversationContent>
        <ScrollToBottom />
      </Conversation>
    )

  const composer = (
    <div
      data-slot="coding-agent-composer"
      className="mx-auto flex w-full max-w-[720px] shrink-0 flex-col gap-2 px-3 pb-3 @3xl/coding-agent:px-4 @3xl/coding-agent:pb-4"
    >
      {todos.length ? <TodoList items={todos} collapsible defaultOpen={false} /> : null}
      {queue.length ? <QueuedMessages items={queue} onItemsChange={setQueue} /> : null}
      <PromptInput
        value={input}
        onValueChange={setInput}
        onSubmit={({ text }) => submit(text)}
        // While the agent works, an empty field offers Stop; typing turns it into Queue.
        status={busy && !input.trim() ? "streaming" : "idle"}
        onStop={stop}
        disabled={!actions.send}
        onFiles={(incoming) => onAttachFiles?.(incoming)}
        accept=".pdf,.docx,.txt,.md,.html,.htm,.csv,.json,.png,.jpg,.jpeg,.webp,.py,.js,.ts,.ipynb"
        maxFileSize={64 * 1024 * 1024}
        hasContent={attachments.length > 0}
      >
        <PromptInputAttachments>
          {attachments.map((file) => (
            <span
              key={file.path}
              data-slot="attachment"
              className="border-chatcn-border bg-chatcn-fill text-chatcn-fg-muted rounded-chatcn-md flex h-7 min-w-0 items-center gap-1.5 border ps-2 pe-1"
            >
              <FileTextIcon className="size-3.5 shrink-0" />
              <span className="chatcn-text-12 max-w-[12rem] truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemoveAttachment?.(file.path)}
                className="hover:bg-chatcn-fill-hover hover:text-chatcn-fg rounded-chatcn-sm flex size-5 items-center justify-center"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </PromptInputAttachments>
        <PromptInputTextarea
          placeholder={busy ? queuePlaceholder : placeholder}
          aria-keyshortcuts="Shift+Tab"
          onKeyDown={(event) => {
            if (event.key === "Tab" && event.shiftKey && !event.nativeEvent.isComposing) {
              if (!permissionModes.length) return
              event.preventDefault()
              setMode(nextPermissionMode(permissionModes, mode))
            }
          }}
        />
        <PromptInputToolbar>
          <PromptInputTools>
            <PromptInputAttachButton tooltip="Attach a document" />
            {onOpenModels ? (
              <button
                type="button"
                onClick={onOpenModels}
                title="Change model"
                data-testid="model-chip"
                className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex h-8 min-w-0 items-center gap-1.5 px-1.5 transition-colors"
              >
                <ModelIcon className="size-3.5 shrink-0" />
                <span className="chatcn-text-12 max-w-[7.5rem] truncate">
                  {composerModel ?? "Model"}
                </span>
                <ChevronDownIcon className="size-3 shrink-0" />
              </button>
            ) : null}
            {onOpenSettings ? (
              <PromptInputButton
                tooltip="Providers & settings"
                onClick={onOpenSettings}
                data-testid="open-settings"
              >
                <SettingsIcon className="size-4" />
              </PromptInputButton>
            ) : null}
            {permissionModes.length ? (
              <PermissionMode
                modes={permissionModes}
                value={mode}
                onValueChange={setMode}
                side="top"
                iconOnly={!wide && width !== undefined && width < 400}
              />
            ) : null}
          </PromptInputTools>
          <PromptInputActions>
            {context ? <ContextMeter {...context} model={context.model ?? model} /> : null}
            <PromptInputSubmit />
          </PromptInputActions>
        </PromptInputToolbar>
      </PromptInput>
    </div>
  )

  const chatPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {thread}
      {composer}
    </div>
  )

  const changesBadge = files.length ? String(files.length) : undefined
  const filesBadge = workspaceFiles.length ? String(workspaceFiles.length) : undefined
  const terminalBadge = terminal.running ? <Spinner className="size-3" /> : undefined
  const workspaceTabs: TabDef<CodingWorkspaceTab>[] = [
    { id: "files", label: "Files", icon: <FolderIcon />, badge: filesBadge },
    { id: "changes", label: "Changes", icon: <DiffIcon />, badge: changesBadge },
    { id: "terminal", label: "Terminal", icon: <SquareTerminalIcon />, badge: terminalBadge },
  ]

  const panel = (which: CodingWorkspaceTab) => (
    <div
      role="tabpanel"
      id={`${id}-panel-${which}`}
      aria-labelledby={`${id}-tab-${which}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {which === "files" ? (
        <FilesView
          files={workspaceFiles}
          onOpen={onOpenFile}
          onDownload={onDownloadFile}
          onRefresh={onRefreshFiles}
        />
      ) : which === "changes" ? (
        <ChangesView workspace={workspace} selected={selected} onSelect={pickFile} />
      ) : (
        <TerminalView terminal={terminal} />
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <PartContext.Provider value={partContext}>
        <div
          ref={rootRef}
          data-slot="coding-agent"
          data-layout={wide ? "split" : "stacked"}
          data-chat-status={status}
          className={cn(
            "bg-chatcn-bg text-chatcn-fg @container/coding-agent flex min-h-0 w-full min-w-0 flex-col overflow-hidden",
            fullHeight ? "h-dvh" : "h-full",
            className,
          )}
          {...props}
        >
          {header}
          {wide ? (
            workspaceOpen ? (
              <ResizableGroup direction="horizontal" className="min-h-0 flex-1">
                <ResizablePanel
                  id={`${id}-chat`}
                  defaultSize={44}
                  minSize="360px"
                  maxSize={64}
                  className="flex min-w-0 flex-col"
                >
                  {chatPane}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                  id={`${id}-workspace`}
                  minSize="320px"
                  className="bg-chatcn-bg-subtle flex min-w-0 flex-col"
                >
                  <TabBar
                    tabs={workspaceTabs}
                    value={tab}
                    onValueChange={pickTab}
                    label="Workspace"
                    idBase={id}
                    className="border-chatcn-border h-11 border-b px-2"
                    end={
                      tab === "changes" && files.length ? (
                        <DiffStat
                          additions={stats.additions}
                          deletions={stats.deletions}
                          className="me-2"
                        />
                      ) : null
                    }
                  />
                  {panel(tab)}
                </ResizablePanel>
              </ResizableGroup>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chatPane}</div>
            )
          ) : (
            <>
              <TabBar
                tabs={[
                  { id: "chat", label: "Chat", icon: <MessageSquareIcon /> },
                  ...workspaceTabs,
                ]}
                value={view}
                onValueChange={(next) => {
                  setView(next)
                  if (next !== "chat") pickTab(next)
                }}
                label="Session"
                idBase={id}
                className="border-chatcn-border h-11 border-b px-2 pointer-coarse:h-14"
              />
              {view === "chat" ? (
                <div
                  role="tabpanel"
                  id={`${id}-panel-chat`}
                  aria-labelledby={`${id}-tab-chat`}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {chatPane}
                </div>
              ) : (
                <div className="bg-chatcn-bg-subtle flex min-h-0 flex-1 flex-col">
                  {panel(view)}
                </div>
              )}
            </>
          )}
        </div>
      </PartContext.Provider>
    </TooltipProvider>
  )
}

export type {
  CodingAgentContext,
  CodingAgentProps as MentorAgentProps,
  CodingAgentStatus as MentorAgentStatus,
  CodingTerminalState,
  CodingWorkspace,
  CodingWorkspaceTab,
}
export { MentorAgent, codingWorkspaceFromMessages, ToolTodoWritePart, todosFrom }
