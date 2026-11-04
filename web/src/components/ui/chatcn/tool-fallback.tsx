import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import {
  ToolCall,
  ToolCallCode,
  type ToolCallProps,
  ToolCallSection,
  toolCallPropsFromPart,
} from "@/components/ui/chatcn/tool-call"
import { useChatcnMiddleTruncate } from "@/hooks/use-chatcn-middle-truncate"
import { BracesIcon } from "@/lib/chatcn-icons"
import { type ChatcnToolPart, getToolName, type ToolDisplayState } from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Shared renderer contract
 * -----------------------------------------------------------------------------------------------*/

/**
 * Props every tool renderer accepts besides its own: the lifecycle that `ToolCall` handles.
 * Each renderer sets `title`, `detail`, `icon` and its own body.
 */
type ToolBaseProps = Omit<
  ToolCallProps,
  "name" | "title" | "detail" | "icon" | "input" | "inputText" | "output" | "children"
> & {
  /** Tool name from the model. Each renderer has a sensible default. */
  name?: string
}

/** What a message renderer passes to any tool renderer. */
interface ToolRendererProps {
  part: ChatcnToolPart
  /** The response was stopped: unfinished calls show as cancelled. */
  stopped?: boolean
  variant?: ToolCallProps["variant"]
  onApprove?: ToolCallProps["onApprove"]
  onDeny?: ToolCallProps["onDeny"]
  onRetry?: ToolCallProps["onRetry"]
  /** Stop a running tool (bash, code execution). */
  onStop?: () => void
  durationMs?: number
  startedAt?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** A renderer for one tool, keyed by tool name in a `ToolRendererMap`. */
type ToolRenderer = (props: ToolRendererProps) => React.ReactNode

/** Tool name to renderer. Spread the maps you want: `{ ...toolBashRenderers, ...toolWebSearchRenderers }`. */
type ToolRendererMap = Record<string, ToolRenderer>

const RUNNING: ToolDisplayState[] = ["input-streaming", "input-available", "approval-responded"]

/** True while the tool is doing work (not waiting on a person, not finished). */
function isToolRunning(state: ToolDisplayState, decision?: ToolCallProps["decision"]) {
  if (state === "approval-responded" && decision?.approved === false) return false
  return RUNNING.includes(state)
}

/**
 * Lifecycle props from a tool part. A `preliminary` output (a tool still streaming its result)
 * keeps the call in its running state, so timers keep ticking and output keeps streaming.
 */
function toolBasePropsFromPart({
  part,
  stopped,
  variant,
  onApprove,
  onDeny,
  onRetry,
  durationMs,
  startedAt,
  open,
  defaultOpen,
  onOpenChange,
  className,
}: ToolRendererProps): ToolBaseProps {
  const { name, state, errorText, approval, decision } = toolCallPropsFromPart(part, { stopped })
  const preliminary = part.preliminary === true && state === "output-available"
  return {
    name,
    state: preliminary ? (stopped ? "cancelled" : "input-available") : state,
    errorText,
    approval,
    decision,
    variant,
    onApprove,
    onDeny,
    onRetry,
    durationMs,
    startedAt,
    open,
    defaultOpen,
    onOpenChange,
    className,
  }
}

/** Reads a record from unknown tool input or output. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** First string value found under any of `keys`. */
function pickString(value: unknown, ...keys: string[]): string | undefined {
  const record = asRecord(value)
  for (const key of keys) {
    const v = record[key]
    if (typeof v === "string") return v
  }
  return undefined
}

/** First number value found under any of `keys`. */
function pickNumber(value: unknown, ...keys: string[]): number | undefined {
  const record = asRecord(value)
  for (const key of keys) {
    const v = record[key]
    if (typeof v === "number" && Number.isFinite(v)) return v
  }
  return undefined
}

const normalize = (name: string) =>
  name
    .replace(/^tool-/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase()

/** Finds the renderer for a tool name: exact first, then case and separator insensitive. */
function findToolRenderer(name: string, renderers: ToolRendererMap): ToolRenderer | undefined {
  if (renderers[name]) return renderers[name]
  const target = normalize(name)
  for (const key of Object.keys(renderers)) if (normalize(key) === target) return renderers[key]
  // MCP tools carry the server in the name (`mcp__linear__create_issue`): route them to `mcp`.
  if (name.startsWith("mcp__") && renderers.mcp) return renderers.mcp
  return undefined
}

/**
 * Renders a tool part with the matching renderer, or `ToolFallbackPart` for unknown tools.
 * `renderToolPart(part, { ...toolBashRenderers, ...toolWebSearchRenderers }, { onApprove })`
 */
function renderToolPart(
  part: ChatcnToolPart,
  renderers: ToolRendererMap,
  props: Omit<ToolRendererProps, "part"> = {},
): React.ReactNode {
  const name = getToolName(part)
  const Renderer = findToolRenderer(name, renderers) ?? ToolFallbackPart
  return <Renderer key={part.toolCallId} part={part} {...props} />
}

/* -------------------------------------------------------------------------------------------------
 * Shared pieces for renderers
 * -----------------------------------------------------------------------------------------------*/

/** Header detail with a trailing fact that never truncates: `query` + `8 results`. */
function ToolDetail({ children, meta }: { children?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <span data-slot="tool-detail" className="inline-flex max-w-full min-w-0 items-baseline gap-2">
      {children ? <span className="min-w-0 truncate">{children}</span> : null}
      {meta !== undefined && meta !== null && meta !== false ? (
        <span className="shrink-0 font-sans tabular-nums">{meta}</span>
      ) : null}
    </span>
  )
}

/**
 * A path or URL that gives way from the folders, never the file name:
 * `prisma/migrations/2026…/migration.sql`. The directory shrinks first and the name only when it
 * alone is wider than the row. The full path is in `title`.
 */
function ToolPath({ path, className }: { path: string; className?: string }) {
  const cut = path.replace(/\/+$/, "").lastIndexOf("/")
  const dir = cut > 0 ? path.slice(0, cut + 1) : ""
  const base = cut > 0 ? path.slice(cut + 1) : path
  return (
    <span data-slot="tool-path" title={path} className={cn("flex max-w-full min-w-0", className)}>
      {dir ? <span className="min-w-0 truncate">{dir}</span> : null}
      <ToolPathName name={base} />
    </span>
  )
}

/** The file name part: cut in the middle when it alone is too wide, so the extension stays. */
function ToolPathName({ name }: { name: string }) {
  const fit = useChatcnMiddleTruncate(name)
  return (
    <span
      ref={fit.ref}
      className="block max-w-full min-w-0 shrink-0 overflow-hidden whitespace-nowrap"
    >
      <span ref={fit.textRef} style={fit.textStyle} aria-hidden="true">
        {fit.text}
      </span>
      <span className="block h-0 overflow-hidden">{name}</span>
    </span>
  )
}

/** Plural helper for counts in headers: `plural(3, "result")` is "3 results". */
function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}

/* -------------------------------------------------------------------------------------------------
 * Summary view
 * -----------------------------------------------------------------------------------------------*/

function summarize(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === "string") return value.split("\n")[0] ?? ""
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return plural(value.length, "item")
  return plural(Object.keys(value as object).length, "field")
}

function stringify(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Key and value pairs for the first fields of an object: the summary before the JSON. */
function FieldList({ value, limit = 6 }: { value: unknown; limit?: number }) {
  if (typeof value === "string") {
    return (
      <p className="chatcn-text-13 text-chatcn-fg-muted line-clamp-4 whitespace-pre-wrap">
        {value}
      </p>
    )
  }
  if (Array.isArray(value)) {
    return (
      <p className="chatcn-text-13 text-chatcn-fg-muted">
        {plural(value.length, "item")}
        {value.length > 0 ? `, first: ${summarize(value[0])}` : null}
      </p>
    )
  }
  const entries = Object.entries(asRecord(value))
  if (entries.length === 0) return <p className="chatcn-text-13 text-chatcn-fg-subtle">Empty</p>
  return (
    <dl className="chatcn-text-12 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
      {entries.slice(0, limit).map(([key, v]) => (
        <React.Fragment key={key}>
          <dt className="text-chatcn-fg-subtle truncate">{key}</dt>
          <dd className="text-chatcn-fg-muted truncate font-mono">{summarize(v)}</dd>
        </React.Fragment>
      ))}
      {entries.length > limit ? (
        <dd className="text-chatcn-fg-subtle col-span-2">
          {plural(entries.length - limit, "more field")}
        </dd>
      ) : null}
    </dl>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ToolFallback
 * -----------------------------------------------------------------------------------------------*/

interface ToolFallbackProps extends ToolBaseProps {
  name: string
  input?: unknown
  inputText?: string
  output?: unknown
  title?: React.ReactNode
  icon?: React.ReactNode
}

/**
 * The renderer for tools nobody wrote a renderer for. Summary first (the fields, the first line of
 * the result), raw JSON one click away, never a wall of JSON by default.
 */
function ToolFallback({
  name,
  input,
  inputText,
  output,
  title,
  icon,
  ...props
}: ToolFallbackProps) {
  const [raw, setRaw] = React.useState(false)
  const hasInput = input !== undefined && input !== null
  const hasOutput = props.state === "output-available" && output !== undefined
  const handlesState =
    props.state !== "output-error" &&
    props.state !== "output-denied" &&
    props.state !== "input-streaming"

  const body =
    handlesState && (hasInput || hasOutput) ? (
      <>
        {raw ? (
          <>
            {hasInput ? (
              <ToolCallSection
                label="Input"
                action={
                  <CopyButton size="icon-xs" value={() => stringify(input)} label="Copy input" />
                }
              >
                <ToolCallCode>{stringify(input)}</ToolCallCode>
              </ToolCallSection>
            ) : null}
            {hasOutput ? (
              <ToolCallSection
                label="Output"
                action={
                  <CopyButton size="icon-xs" value={() => stringify(output)} label="Copy output" />
                }
              >
                <ToolCallCode>{stringify(output)}</ToolCallCode>
              </ToolCallSection>
            ) : null}
          </>
        ) : (
          <>
            {hasInput ? (
              <ToolCallSection label="Input">
                <FieldList value={input} />
              </ToolCallSection>
            ) : null}
            {hasOutput ? (
              <ToolCallSection label="Output">
                <FieldList value={output} />
              </ToolCallSection>
            ) : null}
          </>
        )}
        <div className="-mt-1 flex">
          <Button
            size="xs"
            aria-pressed={raw}
            onClick={() => setRaw((v) => !v)}
            className={cn("-ms-2", raw && "text-chatcn-fg")}
          >
            <BracesIcon />
            {raw ? "Show summary" : "Show JSON"}
          </Button>
        </div>
      </>
    ) : undefined

  return (
    <ToolCall
      name={name}
      title={title}
      icon={icon}
      input={handlesState ? undefined : input}
      inputText={inputText}
      // ToolCall reads the header detail from the input; keep it when the body is ours.
      detail={handlesState ? detailOf(input) : undefined}
      {...props}
    >
      {body}
    </ToolCall>
  )
}

function detailOf(input: unknown) {
  return pickString(
    input,
    "path",
    "file",
    "filePath",
    "query",
    "command",
    "cmd",
    "url",
    "pattern",
    "name",
  )
}

function ToolFallbackPart(props: ToolRendererProps) {
  const base = toolBasePropsFromPart(props)
  const { part } = props
  return (
    <ToolFallback
      {...base}
      name={base.name ?? "tool"}
      title={part.title}
      input={part.input}
      inputText={typeof part.rawInput === "string" ? part.rawInput : undefined}
      output={part.output}
    />
  )
}

export type { ToolBaseProps, ToolFallbackProps, ToolRenderer, ToolRendererMap, ToolRendererProps }
export {
  asRecord,
  findToolRenderer,
  isToolRunning,
  pickNumber,
  pickString,
  plural,
  renderToolPart,
  ToolDetail,
  ToolFallback,
  ToolFallbackPart,
  ToolPath,
  toolBasePropsFromPart,
}
