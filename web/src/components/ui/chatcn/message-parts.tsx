"use client"

import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { ThinkingIndicator } from "@/components/ui/chatcn/thinking-indicator"
import {
  ToolCall,
  type ToolCallProps,
  toolCallPropsFromPart,
} from "@/components/ui/chatcn/tool-call"
import { ChevronRightIcon, FileIcon, GlobeIcon } from "@/lib/chatcn-icons"
import {
  type ChatcnFilePart,
  type ChatcnMessage,
  type ChatcnPart,
  type ChatcnReasoningPart,
  type ChatcnSourceDocumentPart,
  type ChatcnSourceUrlPart,
  type ChatcnTextPart,
  type ChatcnToolPart,
  isDataPart,
  isTerminalToolState,
  isToolPart,
} from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type ChatcnSourcePart = ChatcnSourceUrlPart | ChatcnSourceDocumentPart

interface TextRenderContext {
  part: ChatcnTextPart
  /** This part is the one being written right now: show a caret if you render your own text. */
  streaming: boolean
}

/** Override any part renderer. Keys for `data-*` parts are their full type, `data-weather`. */
interface MessagePartComponents {
  reasoning: React.ComponentType<{ part: ChatcnReasoningPart; streaming: boolean }>
  tool: React.ComponentType<{ part: ChatcnToolPart; stopped: boolean }>
  sources: React.ComponentType<{ parts: ChatcnSourcePart[] }>
  file: React.ComponentType<{ part: ChatcnFilePart }>
  fallback: React.ComponentType<{ part: ChatcnPart }>
  [dataType: `data-${string}`]: React.ComponentType<{ part: ChatcnPart }>
}

interface MessagePartsProps extends Omit<React.ComponentProps<"div">, "children"> {
  message: ChatcnMessage
  /**
   * The reply is still being generated. Gaps between parts (after a tool result, before the next
   * token) show the thinking indicator, with its 300 ms delay so quick gaps show nothing.
   */
  streaming?: boolean
  /** The user stopped this reply: unfinished tool calls render as cancelled. */
  stopped?: boolean
  /** Render text parts yourself, for example with a markdown renderer. Defaults to plain text. */
  renderText?: (text: string, context: TextRenderContext) => React.ReactNode
  components?: Partial<MessagePartComponents>
  /** Extra props for each tool call, such as `onApprove`, `onDeny` and `onRetry`. */
  toolProps?: (part: ChatcnToolPart) => Partial<ToolCallProps>
  /** Defaults to `inline`: quiet rows that keep long traces readable. */
  toolVariant?: ToolCallProps["variant"]
  /** Label for the pending indicator. Defaults to "Thinking". */
  thinkingLabel?: string
}

/* -------------------------------------------------------------------------------------------------
 * Default renderers
 * -----------------------------------------------------------------------------------------------*/

/** Plain text with paragraphs on blank lines. The caret rides at the end of the last line. */
function PlainText({ text, streaming }: { text: string; streaming: boolean }) {
  const paragraphs = text.replace(/\s+$/, "").split(/\n{2,}/)
  return (
    <div data-slot="message-text" className="flex flex-col gap-4">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {paragraph}
          {streaming && i === paragraphs.length - 1 ? <StreamingCaret activity={text} /> : null}
        </p>
      ))}
    </div>
  )
}

const NBSP = "\u00a0"

/** Minimal reasoning: one collapsed line, "Thinking" while it streams, "Thought for 4 s" after. */
function DefaultReasoning({ part, streaming }: { part: ChatcnReasoningPart; streaming: boolean }) {
  const startedAt = React.useRef<number | null>(streaming ? Date.now() : null)
  const [seconds, setSeconds] = React.useState<number>()
  React.useEffect(() => {
    if (streaming && startedAt.current === null) startedAt.current = Date.now()
    if (!streaming && startedAt.current !== null && seconds === undefined) {
      setSeconds(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))
    }
  }, [streaming, seconds])

  const label = streaming ? (
    <ShimmerText>Thinking</ShimmerText>
  ) : (
    <span>{seconds ? `Thought for ${seconds}${NBSP}s` : "Thought"}</span>
  )

  return (
    <Collapsible.Root data-slot="message-reasoning" className="flex flex-col">
      <Collapsible.Trigger
        className={cn(
          "chatcn-focus group/reasoning rounded-chatcn-sm chatcn-text-14 text-chatcn-fg-subtle -ms-1 inline-flex h-7 w-fit items-center gap-1 px-1",
          "hover:text-chatcn-fg transition-colors duration-150",
        )}
      >
        {label}
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "ease-chatcn-out size-3.5 transition-transform duration-200 motion-reduce:transition-none",
            "group-data-[panel-open]/reasoning:rotate-90 rtl:-scale-x-100",
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
          "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        )}
      >
        <p className="chatcn-text-14 text-chatcn-fg-muted border-chatcn-border mt-1 mb-1 border-s ps-3.5 whitespace-pre-wrap">
          {part.text}
          {streaming ? <StreamingCaret activity={part.text} /> : null}
        </p>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Quiet source chips. A sources component from the content group can replace it. */
function DefaultSources({ parts }: { parts: ChatcnSourcePart[] }) {
  return (
    <div data-slot="message-sources" className="flex flex-wrap items-center gap-1.5">
      {parts.map((part) =>
        part.type === "source-url" ? (
          <a
            key={part.sourceId}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            title={part.url}
            className={cn(
              "chatcn-focus chatcn-text-12 text-chatcn-fg-muted bg-chatcn-fill hover:bg-chatcn-fill-hover hover:text-chatcn-fg",
              "inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full px-2 transition-colors duration-150",
              "[&_svg]:size-3 [&_svg]:shrink-0",
            )}
          >
            <GlobeIcon aria-hidden="true" />
            <span className="truncate">{part.title ?? hostOf(part.url)}</span>
          </a>
        ) : (
          <span
            key={part.sourceId}
            className="chatcn-text-12 text-chatcn-fg-muted bg-chatcn-fill inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full px-2 [&_svg]:size-3 [&_svg]:shrink-0"
          >
            <FileIcon aria-hidden="true" />
            <span className="truncate">{part.title}</span>
          </span>
        ),
      )}
    </div>
  )
}

function DefaultFile({ part }: { part: ChatcnFilePart }) {
  if (part.mediaType.startsWith("image/")) {
    return (
      <img
        src={part.url}
        alt={part.filename ?? ""}
        className="rounded-chatcn-lg shadow-chatcn-border max-h-60 w-auto max-w-full object-contain"
      />
    )
  }
  return (
    <span
      data-slot="message-file"
      className="chatcn-text-13 text-chatcn-fg-muted bg-chatcn-fill rounded-chatcn-md inline-flex h-8 w-fit max-w-full items-center gap-2 px-2.5 [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <FileIcon aria-hidden="true" />
      <span className="truncate">{part.filename ?? part.mediaType}</span>
    </span>
  )
}

/** Unknown part types land here. Quiet, and never a crash. */
function DefaultFallback({ part }: { part: ChatcnPart }) {
  return (
    <p data-slot="message-part-fallback" className="chatcn-text-12 text-chatcn-fg-subtle font-mono">
      Unsupported part: {part.type}
    </p>
  )
}

/** Keeps one broken renderer from taking down the whole transcript. */
class PartBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/* -------------------------------------------------------------------------------------------------
 * Grouping
 * -----------------------------------------------------------------------------------------------*/

type Segment =
  | { kind: "part"; part: ChatcnPart; index: number }
  | { kind: "tools"; parts: ChatcnToolPart[]; index: number }
  | { kind: "sources"; parts: ChatcnSourcePart[]; index: number }

const isSource = (part: ChatcnPart): part is ChatcnSourcePart =>
  part.type === "source-url" || part.type === "source-document"

/** Folds consecutive tool parts and consecutive source parts into one segment each. */
function segment(parts: ChatcnPart[]): Segment[] {
  const out: Segment[] = []
  parts.forEach((part, index) => {
    const last = out.at(-1)
    if (isToolPart(part)) {
      if (last?.kind === "tools") last.parts.push(part)
      else out.push({ kind: "tools", parts: [part], index })
    } else if (isSource(part)) {
      if (last?.kind === "sources") last.parts.push(part)
      else out.push({ kind: "sources", parts: [part], index })
    } else if (part.type !== "step-start") {
      out.push({ kind: "part", part, index })
    }
  })
  return out
}

/** True while the newest part is still moving on its own, so no thinking indicator is needed. */
function isBusy(part: ChatcnPart | undefined) {
  if (!part) return false
  if (part.type === "text" || part.type === "reasoning") return part.state === "streaming"
  if (isToolPart(part)) return !isTerminalToolState(part.state)
  return false
}

/* -------------------------------------------------------------------------------------------------
 * MessageParts
 * -----------------------------------------------------------------------------------------------*/

/**
 * Renders a message's parts in order: text, reasoning, tool calls (consecutive calls grouped),
 * sources, files, app data and a quiet fallback for anything unknown. Plug in markdown with
 * `renderText` and richer reasoning or sources with `components`.
 */
function MessageParts({
  message,
  streaming = false,
  stopped = false,
  renderText,
  components = {},
  toolProps,
  toolVariant = "inline",
  thinkingLabel,
  className,
  ...props
}: MessagePartsProps) {
  const parts = message.parts
  const segments = React.useMemo(() => segment(parts), [parts])
  const lastIndex = parts.length - 1
  const [everStreamed, setEverStreamed] = React.useState(streaming)
  if (streaming && !everStreamed) setEverStreamed(true)

  const Fallback = components.fallback ?? DefaultFallback
  const Reasoning = components.reasoning ?? DefaultReasoning
  const Sources = components.sources ?? DefaultSources
  const File = components.file ?? DefaultFile

  const renderPart = (part: ChatcnPart, index: number): React.ReactNode => {
    const live = streaming && index === lastIndex
    switch (part.type) {
      case "text": {
        const text = part as ChatcnTextPart
        const writing = live && text.state === "streaming"
        if (!text.text && !writing) return null
        return renderText ? (
          renderText(text.text, { part: text, streaming: writing })
        ) : (
          <PlainText text={text.text} streaming={writing} />
        )
      }
      case "reasoning": {
        const reasoning = part as ChatcnReasoningPart
        return (
          <Reasoning part={reasoning} streaming={reasoning.state === "streaming" && !stopped} />
        )
      }
      case "file":
        return <File part={part as ChatcnFilePart} />
      default: {
        if (isDataPart(part)) {
          const Data = components[part.type as `data-${string}`]
          return Data ? <Data part={part} /> : null
        }
        return <Fallback part={part} />
      }
    }
  }

  const renderTool = (part: ChatcnToolPart) => {
    const Tool = components.tool
    if (Tool) return <Tool key={part.toolCallId} part={part} stopped={stopped} />
    return (
      <ToolCall
        key={part.toolCallId}
        variant={toolVariant}
        {...toolCallPropsFromPart(part, { stopped })}
        {...toolProps?.(part)}
      />
    )
  }

  const last = parts[lastIndex]
  const waiting = streaming && !stopped && !isBusy(last)
  // Streaming reasoning shows its own "Thinking" in the same spot: hand over instead of stacking
  // two identical labels for the indicator's minimum 400 ms.
  const handoff = last?.type === "reasoning" && (last as ChatcnReasoningPart).state === "streaming"

  return (
    <div
      data-slot="message-parts"
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    >
      {segments.map((seg) => {
        const fallback = <Fallback part={seg.kind === "part" ? seg.part : { type: seg.kind }} />
        if (seg.kind === "tools") {
          return (
            <PartBoundary key={`tools-${seg.index}`} fallback={fallback}>
              <div
                data-slot="message-tool-group"
                className={cn(
                  "flex flex-col",
                  toolVariant === "inline" ? "-mx-2 gap-0.5" : "gap-2",
                )}
              >
                {seg.parts.map(renderTool)}
              </div>
            </PartBoundary>
          )
        }
        if (seg.kind === "sources") {
          return (
            <PartBoundary key={`sources-${seg.index}`} fallback={fallback}>
              <Sources parts={seg.parts} />
            </PartBoundary>
          )
        }
        const node = renderPart(seg.part, seg.index)
        if (node === null) return null
        return (
          <PartBoundary key={`${seg.part.type}-${seg.index}`} fallback={fallback}>
            {node}
          </PartBoundary>
        )
      })}
      {everStreamed && !handoff ? (
        <ThinkingIndicator active={waiting} label={thinkingLabel} />
      ) : null}
    </div>
  )
}

export type { MessagePartComponents, MessagePartsProps, TextRenderContext }
export { MessageParts }
