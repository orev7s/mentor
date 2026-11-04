import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { StepTimer } from "@/components/ui/chatcn/step-timer"
import {
  isTraceActive,
  Trace,
  TraceConnector,
  type TraceStatus,
  TraceStatusGlyph,
} from "@/components/ui/chatcn/trace"
import { ChevronDownIcon, ListTreeIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

interface TraceGroupProps extends Omit<React.ComponentProps<"li">, "title"> {
  status: TraceStatus
  /** Summary once finished, for example "Read 6 files". */
  title: React.ReactNode
  /** Label while running, for example "Reading files". Defaults to `title`. */
  activeTitle?: React.ReactNode
  /**
   * The "doing now" line while running: the file being read, the site being searched. Swaps in
   * place without animation, so a group that moves through 300 steps stays still.
   */
  current?: React.ReactNode
  /** Shown in place of `current` once finished, for example "4 KB" or "2 failed". */
  summary?: React.ReactNode
  /** Glyph at rest. Defaults to a list tree. */
  icon?: React.ReactNode
  durationMs?: number
  startedAt?: number
  /** Cap for the expanded list before it scrolls. Defaults to 22 rem. */
  maxHeight?: string
  /** The grouped steps, usually `TraceStep` elements. Mounted only while expanded. */
  children?: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Groups consecutive steps of one kind behind a single line: "Read 6 files", "Searched 4 sites".
 * While running, the line doubles as a heads-up display of what the agent is doing right now.
 * Collapsed by default; expanding mounts the children in a compact nested trace.
 */
function TraceGroup({
  status,
  title,
  activeTitle,
  current,
  summary,
  icon,
  durationMs,
  startedAt,
  maxHeight = "22rem",
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  style,
  ...props
}: TraceGroupProps) {
  const active = isTraceActive(status)
  const finished = status === "done"
  const detail = active ? current : summary
  const label = active ? (activeTitle ?? title) : title
  const triggerId = React.useId()

  return (
    <li
      data-slot="trace-group"
      data-trace-status={status}
      className={cn("group/trace-item relative min-w-0", className)}
      style={style}
      {...props}
    >
      <TraceConnector />
      <Collapsible.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        render={<div />}
        className="group/trace-group"
      >
        <Collapsible.Trigger
          id={triggerId}
          className={cn(
            "rounded-chatcn-md flex h-(--trace-row) w-full min-w-0 items-center gap-2.5 px-2 text-start outline-none select-none",
            "ease-chatcn-standard transition-colors duration-150",
            "hover:bg-chatcn-fill-hover focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
          )}
        >
          <TraceStatusGlyph status={status} icon={icon ?? <ListTreeIcon />} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span
              className={cn(
                "shrink-0 font-medium tabular-nums",
                status === "cancelled" || status === "skipped"
                  ? "text-chatcn-fg-subtle"
                  : "text-chatcn-fg",
              )}
            >
              {label}
            </span>
            {detail ? (
              <span
                data-slot="trace-group-current"
                className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono"
              >
                {detail}
              </span>
            ) : null}
          </span>
          <span className="shrink-0">
            {active ? (
              <StepTimer running startedAt={startedAt} />
            ) : finished ? (
              <StepTimer durationMs={durationMs} />
            ) : status === "error" ? (
              <span className="chatcn-text-12 text-chatcn-red">Failed</span>
            ) : null}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            data-trace-chevron=""
            className={cn(
              "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-[rotate] duration-200",
              "group-data-[open]/trace-group:rotate-180 motion-reduce:transition-none",
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Panel
          className={cn(
            "h-(--collapsible-panel-height) overflow-hidden",
            "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
            "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
            "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
          )}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a labelled scroll region, not a form fieldset */}
          <div
            data-slot="trace-group-content"
            // Scrolls past maxHeight, so it takes focus (named by the trigger) for keyboard scrolling.
            role="group"
            aria-labelledby={triggerId}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable regions must be reachable by keyboard
            tabIndex={0}
            // The bottom fade hints at more rows; the padding keeps the last row out of it.
            className={cn(
              "chatcn-scroll overflow-y-auto mask-b-from-[calc(100%-1rem)] ps-[26px] pb-4",
              "rounded-chatcn-md focus-visible:outline-chatcn-accent outline-none focus-visible:outline-2 focus-visible:-outline-offset-2",
            )}
            style={{ maxHeight }}
          >
            <Trace density="compact">{children}</Trace>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
      {/* Announce the finished summary once, never the moving "doing now" line. */}
      <span aria-live="polite" className="sr-only">
        {finished ? title : ""}
      </span>
    </li>
  )
}

export type { TraceGroupProps }
export { TraceGroup }
