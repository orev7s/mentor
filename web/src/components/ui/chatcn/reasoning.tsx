import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import { useChatcnStickToBottom } from "@/hooks/use-chatcn-auto-height"
import {
  formatChatcnDuration,
  speakChatcnDuration,
  useChatcnElapsed,
} from "@/hooks/use-chatcn-elapsed"
import { ChevronDownIcon, ChevronRightIcon, EyeOffIcon, ReasoningIcon } from "@/lib/chatcn-icons"
import type { ChatcnReasoningPart } from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type ReasoningVariant = "inline" | "card" | "minimal"

interface ReasoningProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The reasoning text so far. Blank-line paragraphs; `**Heading**` lines become headings. */
  text?: string
  /** `streaming` while the model thinks, `done` afterwards. */
  state?: "streaming" | "done"
  /** Epoch ms when thinking started. Measured from the first streaming render when omitted. */
  startedAt?: number
  /** Final thinking time in ms. Measured automatically when omitted. */
  durationMs?: number
  /**
   * One line about what the model is thinking about right now, shown next to "Thinking". Derived
   * from the latest heading or paragraph when omitted. Pass `null` to hide it.
   */
  summary?: React.ReactNode
  /** The provider hid or encrypted the reasoning. Only the duration and a note are shown. */
  redacted?: boolean
  variant?: ReasoningVariant
  /** Custom body, for example a markdown renderer. Replaces the built-in text view. */
  children?: React.ReactNode
  open?: boolean
  /** Collapsed by default, also while streaming. Nothing ever closes it on a timer. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/* -------------------------------------------------------------------------------------------------
 * Text helpers
 * -----------------------------------------------------------------------------------------------*/

const HEADING = /^\s*\*\*(.+?)\*\*\s*$/

/** The latest heading, or else the first sentence of the latest finished paragraph. */
function deriveSummary(text: string): string | undefined {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const match = HEADING.exec(blocks[i] as string)
    if (match) return match[1]
  }
  // Only use a paragraph once its first sentence is complete, so the line does not churn.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const sentence = /^(.+?[.!?])(\s|$)/.exec(blocks[i] as string)
    if (sentence) return sentence[1]
  }
  return undefined
}

function ReasoningText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, i) => {
        const heading = HEADING.exec(block)
        return heading ? (
          <p key={i} className="text-chatcn-fg font-medium">
            {heading[1]}
          </p>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {block}
          </p>
        )
      })}
    </>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Reasoning
 * -----------------------------------------------------------------------------------------------*/

/**
 * Model reasoning behind one quiet line: "Thinking" with a live timer while it streams, then
 * "Thought for 12 s". Collapsed by default and never closed on a timer: if the user opens it while
 * the model thinks, it stays open. The body grows with smooth height so streamed lines ease in.
 */
function Reasoning({
  text = "",
  state = "done",
  startedAt,
  durationMs,
  summary,
  redacted = false,
  variant = "inline",
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: ReasoningProps) {
  const streaming = state === "streaming"
  const { ms } = useChatcnElapsed({ running: streaming, startedAt, durationMs })
  const [openState, setOpenState] = React.useState(defaultOpen)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }

  const shownSummary = React.useMemo(() => {
    if (summary !== undefined) return summary
    if (redacted || !streaming) return undefined
    return deriveSummary(text)
  }, [summary, redacted, streaming, text])

  const seconds = ms === undefined ? undefined : formatChatcnDuration(ms, { precise: false })
  const doneLabel =
    ms === undefined
      ? "Thought for a few seconds"
      : `Thought for ${formatChatcnDuration(Math.max(ms, 1000), { precise: false })}`

  const scrollRef = useChatcnStickToBottom(text, { enabled: streaming })

  const isCard = variant === "card"
  const isMinimal = variant === "minimal"

  const header = streaming ? (
    <>
      <ShimmerText className={cn("shrink-0 whitespace-nowrap", isMinimal && "font-normal")}>
        Thinking
      </ShimmerText>
      {seconds && ms !== undefined && ms >= 1000 ? (
        <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
          {seconds}
        </span>
      ) : null}
      {shownSummary && !isMinimal ? (
        <span
          data-slot="reasoning-summary"
          className="text-chatcn-fg-subtle min-w-0 truncate font-normal"
        >
          {shownSummary}
        </span>
      ) : null}
    </>
  ) : (
    <>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          isMinimal ? "font-normal" : "font-medium",
          "text-chatcn-fg-muted group-hover/reasoning-trigger:text-chatcn-fg transition-colors duration-150",
        )}
      >
        {doneLabel}
      </span>
      {redacted ? (
        <span className="chatcn-text-12 text-chatcn-fg-subtle flex min-w-0 items-center gap-1 [&_svg]:size-3.5">
          <EyeOffIcon aria-hidden="true" className="shrink-0" />
          <span className="truncate">Hidden by the provider</span>
        </span>
      ) : null}
    </>
  )

  const body = redacted ? (
    <p className="text-pretty">
      Reasoning hidden by the provider. It stays encrypted and goes back to the model with the next
      turn, so the answer still builds on it.
    </p>
  ) : (
    (children ??
    (text ? (
      <ReasoningText text={text} />
    ) : (
      <p className="text-chatcn-fg-subtle">Starting to think…</p>
    )))
  )

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      render={<div />}
      data-slot="reasoning"
      data-reasoning-state={streaming ? "streaming" : "done"}
      data-variant={variant}
      className={cn(
        "group/reasoning chatcn-text-14 min-w-0",
        isCard && "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm overflow-hidden",
        className,
      )}
      {...props}
    >
      <Collapsible.Trigger
        className={cn(
          "group/reasoning-trigger flex min-w-0 items-center text-start outline-none select-none",
          "ease-chatcn-standard transition-colors duration-150",
          "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
          isCard && "hover:bg-chatcn-alpha-100 h-10 w-full gap-2.5 px-3.5",
          variant === "inline" &&
            "rounded-chatcn-md hover:bg-chatcn-fill-hover h-8 w-full gap-2.5 px-2",
          isMinimal &&
            "rounded-chatcn-sm chatcn-text-13 text-chatcn-fg-subtle hover:text-chatcn-fg inline-flex h-7 max-w-full gap-1.5 focus-visible:outline-offset-2",
        )}
      >
        {isMinimal ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-4 shrink-0 place-items-center [&_svg]:size-4",
              streaming ? "text-chatcn-fg" : "text-chatcn-fg-subtle",
            )}
          >
            <ReasoningIcon />
          </span>
        )}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">{header}</span>
        {isMinimal ? (
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              "ease-chatcn-out size-3.5 shrink-0 transition-[rotate] duration-200 rtl:-scale-x-100",
              "group-data-[open]/reasoning:rotate-90 motion-reduce:transition-none",
            )}
          />
        ) : (
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-[rotate] duration-200",
              "group-data-[open]/reasoning:rotate-180 motion-reduce:transition-none",
            )}
          />
        )}
      </Collapsible.Trigger>

      <Collapsible.Panel
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
          "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
          "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        )}
      >
        {/*
         * One scroll region, not a measured wrapper around one. An animated wrapper whose height
         * lagged behind the content was clamping the last lines, and a scroll container with no
         * bottom padding put the final line flush against the edge. The panel already animates
         * open; the region grows to `max-h` and owns its own padding.
         */}
        <div
          ref={scrollRef}
          data-slot="reasoning-content"
          className={cn(
            "chatcn-text-13 text-chatcn-fg-muted chatcn-scroll flex max-h-72 flex-col gap-2 overflow-y-auto text-pretty [scroll-padding-block-end:1rem]",
            isCard && "px-3.5 pt-0.5 pb-3.5",
            variant === "inline" &&
              "border-chatcn-border ms-[15.5px] mt-1 mb-2 border-s ps-[17.5px] pb-2",
            isMinimal && "border-chatcn-border mt-1 mb-2 border-s ps-3 pb-2",
          )}
        >
          {body}
        </div>
      </Collapsible.Panel>

      {/* Announce once, when thinking ends. Never every second. */}
      <span aria-live="polite" className="sr-only">
        {!streaming && ms !== undefined ? `Thought for ${speakChatcnDuration(ms)}` : ""}
      </span>
    </Collapsible.Root>
  )
}

/* -------------------------------------------------------------------------------------------------
 * From a message part
 * -----------------------------------------------------------------------------------------------*/

/** Maps a reasoning part (chatcn contract or AI SDK) to `Reasoning` props. */
function reasoningPropsFromPart(
  part: ChatcnReasoningPart,
): Pick<ReasoningProps, "text" | "state" | "redacted"> {
  return {
    text: part.text,
    state: part.state === "streaming" ? "streaming" : "done",
    // Providers that encrypt reasoning send an empty text part once it is done.
    redacted: part.state !== "streaming" && part.text.trim() === "",
  }
}

export type { ReasoningProps, ReasoningVariant }
export { Reasoning, reasoningPropsFromPart }
