import * as React from "react"
import { Markdown } from "@/components/ui/chatcn/markdown"
import { Message, MessageContent, MessageStatus } from "@/components/ui/chatcn/message"
import { MessageAction, MessageActionCopy, MessageActions } from "@/components/ui/chatcn/message-actions"
import { type MessagePartComponents, MessageParts } from "@/components/ui/chatcn/message-parts"
import { Reasoning, reasoningPropsFromPart } from "@/components/ui/chatcn/reasoning"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { type TodoItem } from "@/components/ui/chatcn/todo-list"
import { Trace, TraceStep } from "@/components/ui/chatcn/trace"
import { TraceGroup } from "@/components/ui/chatcn/trace-group"
import { renderToolPart } from "@/components/ui/chatcn/tool-fallback"
import { useConversation } from "@/components/ui/chatcn/conversation"
import { formatChatcnDuration, useChatcnElapsed } from "@/hooks/use-chatcn-elapsed"
import { FileTextIcon, GitForkIcon, Volume2Icon, VolumeXIcon } from "@/lib/chatcn-icons"
import {
  type ChatcnMessage,
  type ChatcnTextPart,
  type ChatcnToolPart,
  getToolName,
  isTerminalToolState,
  isToolPart,
} from "@/lib/chatcn-types"
import {
  EDIT_TOOLS,
  READ_TOOLS,
  SHELL_TOOLS,
  TODO_CLEAR_TOOLS,
  TODO_TOOLS,
  WRITE_TOOLS,
  str,
  todosFrom,
  toolKey,
} from "./mentor-workspace"
import {
  GroupContext,
  PartContext,
  TodoUpdateContext,
  type ReadGroup,
  type TodoUpdate,
} from "./mentor-agent-shared"
import { ArtifactsPart } from "./mentor-workspace-views"

/** Tool names → what the student sees while the call runs. */
const ACTIVITY_LABELS: Record<string, string> = {
  bash: "Running a command",
  shell: "Running a command",
  run_command: "Running a command",
  read: "Reading a file",
  read_file: "Reading a file",
  read_document: "Reading a document",
  ocr_image: "Reading an image",
  web_search: "Searching the web",
  web_fetch: "Reading a page",
  write: "Writing a file",
  write_file: "Writing a file",
  edit: "Editing a file",
  edit_file: "Editing a file",
  todo_write: "Planning the work",
  todo_clear: "Clearing the plan",
  share_file: "Preparing a file",
  ask_student: "Waiting for your answer",
}

function activityLabel(part: ChatcnToolPart) {
  const known = ACTIVITY_LABELS[toolKey(part)]
  if (known) return known
  const name = getToolName(part)
  return name ? `Running ${name.replace(/[_-]+/g, " ")}` : "Working"
}

/** What the run is doing right now, from the tail of the thread. */
function currentActivity(messages: ChatcnMessage[]): string | undefined {
  const last = messages.at(-1)
  if (!last || last.role !== "assistant") return undefined
  for (let i = last.parts.length - 1; i >= 0; i -= 1) {
    const part = last.parts[i]
    if (!part) continue
    // Reasoning has its own "Thinking" line; do not say it twice.
    if (part.type === "reasoning") return undefined
    if (part.type === "text") return undefined
    if (isToolPart(part)) return isTerminalToolState(part.state) ? undefined : activityLabel(part)
  }
  return undefined
}

/**
 * The run-level working state: shown for every model while a run is in flight, so the student
 * always knows something is happening even when the model does not narrate. It carries the
 * current step and the elapsed time.
 */
export function WorkingRow({
  messages,
  startedAt,
}: {
  messages: ChatcnMessage[]
  startedAt?: number
}) {
  const activity = currentActivity(messages)
  const { ms } = useChatcnElapsed({ running: true, startedAt })
  if (startedAt === undefined) return null
  return (
    <div
      data-slot="working"
      role="status"
      aria-live="polite"
      className="chatcn-text-14 text-chatcn-fg-subtle -ms-1 flex min-h-6 items-center gap-2 py-0.5"
    >
      <Spinner className="size-3.5 shrink-0" />
      <ShimmerText>Working</ShimmerText>
      {activity ? <span className="chatcn-text-13 truncate">{activity}</span> : null}
      {ms !== undefined && ms >= 1000 ? (
        <span aria-hidden="true" className="chatcn-text-12 shrink-0 tabular-nums">
          {formatChatcnDuration(ms, { precise: false })}
        </span>
      ) : null}
    </div>
  )
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
  return groups
}

/**
 * The agent marks a plan step done with a `todo_write` between two thoughts. Diff
 * each update against the one before it so the thread can show a short "Completed
 * <task>" row at the point it happened, instead of hiding every update but the
 * first and leaving the student to watch only the pinned card.
 */
function todoUpdatesInMessage(message: ChatcnMessage): Map<string, TodoUpdate> {
  const out = new Map<string, TodoUpdate>()
  let previous: TodoItem[] | null = null
  for (const part of message.parts) {
    if (!isToolPart(part)) continue
    const key = toolKey(part)
    if (TODO_CLEAR_TOOLS.has(key)) {
      previous = null
      continue
    }
    if (!TODO_TOOLS.has(key)) continue
    const items = todosFrom(part.input)
    const before = new Map((previous ?? []).map((item) => [item.title, item.status]))
    const completed = items.filter(
      (item) => item.status === "done" && before.get(item.title) !== "done",
    )
    const started = items.filter(
      (item) => item.status === "in-progress" && before.get(item.title) !== "in-progress",
    )
    out.set(part.toolCallId, {
      first: previous === null,
      completed,
      started,
      changed: [...completed, ...started],
      total: items.length,
      done: items.filter((item) => item.status === "done").length,
    })
    previous = items
  }
  return out
}

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

export function messageText(message: ChatcnMessage) {
  return message.parts
    .filter((p): p is ChatcnTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim()
}

export const AgentMessage = React.memo(function AgentMessage({
  message,
  streaming,
  stopped,
  latest,
  onFork,
  onSpeak,
  speaking,
}: {
  message: ChatcnMessage
  streaming: boolean
  stopped: boolean
  latest: boolean
  onFork?: (message: ChatcnMessage) => void
  onSpeak?: (message: ChatcnMessage) => void
  speaking?: boolean
}) {
  const groups = React.useMemo(() => readGroups(message), [message])
  const todoUpdates = React.useMemo(() => todoUpdatesInMessage(message), [message])
  const text = messageText(message)
  const fork = onFork ? (
    <MessageAction label="Fork from here" onClick={() => onFork(message)}>
      <GitForkIcon className="size-4" />
    </MessageAction>
  ) : null
  const readAloud =
    text && onSpeak ? (
      <MessageAction
        label={speaking ? "Stop reading" : "Read aloud"}
        onClick={() => onSpeak(message)}
      >
        {speaking ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
      </MessageAction>
    ) : null

  if (message.role !== "assistant") {
    return (
      <Message from={message.role} latest={latest}>
        <MessageContent>{text}</MessageContent>
        <MessageActions>
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
    >
      <MessageContent>
        <GroupContext.Provider value={groups}>
          <TodoUpdateContext.Provider value={todoUpdates}>
            <MessageParts
              message={message}
              streaming={streaming}
              stopped={stopped}
              renderText={renderMarkdown}
              components={partComponents}
              toolVariant="inline"
              showThinking={false}
            />
          </TodoUpdateContext.Provider>
        </GroupContext.Provider>
      </MessageContent>
      <MessageStatus />
      {!streaming && !waiting && text ? (
        <MessageActions>
          <MessageActionCopy value={text} label="Copy response" />
          {readAloud}
          {fork}
        </MessageActions>
      ) : null}
    </Message>
  )
})
