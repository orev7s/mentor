import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { StepTimer } from "@/components/ui/chatcn/step-timer"
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleStopIcon,
  CircleXIcon,
  HandIcon,
  MinusIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

/** Every state an agent step can be in. A superset of tool states, for any kind of step. */
type TraceStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "approval-requested"
  | "approval-responded"
  | "denied"
  | "cancelled"
  | "retrying"
  | "skipped"

type TraceDensity = "default" | "compact"

const TraceContext = React.createContext<{ density: TraceDensity }>({ density: "default" })

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

const ACTIVE: TraceStatus[] = ["running", "approval-responded", "retrying"]

/** True while the step is doing work, so timers tick and spinners spin. */
function isTraceActive(status: TraceStatus) {
  return ACTIVE.includes(status)
}

const QUIET: TraceStatus[] = ["pending", "skipped", "cancelled", "denied"]

const STATUS_TEXT: Record<TraceStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  error: "Failed",
  "approval-requested": "Needs approval",
  "approval-responded": "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  retrying: "Retrying",
  skipped: "Skipped",
}

/**
 * Remembers whether a value has changed since mount. The status glyph only plays its swap after a
 * real change, so a trace of 300 finished steps mounts perfectly still.
 */
function useChangedSinceMount<T>(value: T) {
  const first = React.useRef(value)
  const changed = React.useRef(false)
  if (!Object.is(value, first.current)) changed.current = true
  return changed.current
}

/* -------------------------------------------------------------------------------------------------
 * Status glyph
 * -----------------------------------------------------------------------------------------------*/

interface TraceStatusGlyphProps {
  status: TraceStatus
  /** Shown at rest (done), for example the tool icon. Defaults to a check. */
  icon?: React.ReactNode
  className?: string
}

/**
 * The status glyph on the rail. Swaps with the chatcn-swap blur crossfade so a running step turning
 * done reads as one object changing, not two icons trading places.
 */
function TraceStatusGlyph({ status, icon, className }: TraceStatusGlyphProps) {
  const { density } = React.useContext(TraceContext)
  const animate = useChangedSinceMount(status)
  let glyph: React.ReactNode
  let tone = "text-chatcn-fg-subtle"

  switch (status) {
    case "running":
    case "approval-responded":
      // Status hues match ToolCall and RunStatus: blue is running, amber needs the user.
      glyph = <Spinner />
      tone = "text-chatcn-blue"
      break
    case "retrying":
      glyph = <RotateCwIcon />
      tone = "text-chatcn-blue"
      break
    case "approval-requested":
      glyph = <HandIcon />
      tone = "text-chatcn-amber"
      break
    case "error":
      glyph = <CircleXIcon />
      tone = "text-chatcn-red"
      break
    case "denied":
      glyph = <BanIcon />
      break
    case "cancelled":
      glyph = <CircleStopIcon />
      break
    case "skipped":
      glyph = <MinusIcon />
      tone = "text-chatcn-fg-faint"
      break
    case "pending":
      // A hollow ring, smaller than an icon: a place in the queue, not a thing yet.
      glyph = (
        <span className="size-2 rounded-full shadow-[inset_0_0_0_1.5px_var(--chatcn-border-strong)]" />
      )
      break
    default:
      glyph =
        icon ??
        (density === "compact" ? (
          <span className="bg-chatcn-fg-faint size-1.5 rounded-full" />
        ) : (
          <CheckIcon />
        ))
  }

  return (
    <span
      data-slot="trace-status"
      aria-hidden="true"
      className={cn(
        "relative grid size-4 shrink-0 place-items-center",
        density === "compact" ? "[&_svg]:size-3.5" : "[&_svg]:size-4",
        tone,
        className,
      )}
    >
      <span
        key={status === "done" ? "done" : status}
        className={cn(
          "grid place-items-center",
          animate && "motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]",
        )}
      >
        {glyph}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Trace
 * -----------------------------------------------------------------------------------------------*/

interface TraceProps extends React.ComponentProps<"ol"> {
  /** `compact` tightens rows to 28 px and uses dots for finished steps. Used inside groups. */
  density?: TraceDensity
}

/**
 * The list that holds agent steps. Each item draws its own rail segment, from just under its glyph
 * to just above the next one, so steps of any height line up on one vertical line.
 */
function Trace({ density = "default", className, ...props }: TraceProps) {
  const value = React.useMemo(() => ({ density }), [density])
  return (
    <TraceContext.Provider value={value}>
      <ol
        data-slot="trace"
        data-density={density}
        className={cn(
          "group/trace flex min-w-0 flex-col",
          // Row height drives the rail geometry, so nested traces can use their own density.
          density === "compact"
            ? "chatcn-text-13 [--trace-row:1.75rem]"
            : "chatcn-text-14 [--trace-row:2rem]",
          className,
        )}
        {...props}
      />
    </TraceContext.Provider>
  )
}

/** The rail segment between this item's glyph and the next one. Hidden on the last item. */
function TraceConnector({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="trace-connector"
      className={cn(
        "bg-chatcn-border pointer-events-none absolute start-[15.5px] w-px",
        "top-[calc(var(--trace-row)/2+12px)] bottom-[calc(12px-var(--trace-row)/2)]",
        "group-last/trace-item:hidden",
        // Compact rows sit inside a group, beside the parent rail: dots alone read cleaner.
        "in-data-[density=compact]:hidden",
        // An open inline tool call draws its own line through its details.
        "group-has-[[data-slot=tool-call][data-variant=inline][data-open]]/trace-item:hidden",
        className,
      )}
    />
  )
}

interface TraceItemProps extends React.ComponentProps<"li"> {
  /** Draw the rail segment down to the next item. Defaults to true. */
  connector?: boolean
}

/**
 * Wraps anything that is not a `TraceStep` (a tool call, a reasoning block, a group) so it sits on
 * the rail. Its first row should be 32 px tall with a 16 px glyph 8 px from the start edge, which
 * every chatcn agent row already is.
 */
function TraceItem({ connector = true, className, children, ...props }: TraceItemProps) {
  return (
    <li
      data-slot="trace-item"
      className={cn("group/trace-item relative min-w-0", className)}
      {...props}
    >
      {connector ? <TraceConnector /> : null}
      {children}
    </li>
  )
}

/* -------------------------------------------------------------------------------------------------
 * TraceStep
 * -----------------------------------------------------------------------------------------------*/

interface TraceStepProps extends Omit<React.ComponentProps<"li">, "title"> {
  status: TraceStatus
  /** What the step does, for example "Read". Set in medium weight. */
  label?: React.ReactNode
  /** Context in mono: a path, a query, a command. Truncates. */
  detail?: React.ReactNode
  /** Glyph at rest (done). Defaults to a check, or a dot in compact traces. */
  icon?: React.ReactNode
  /** Replaces the status text and timer at the end of the row. */
  meta?: React.ReactNode
  /** Final duration in ms, shown when done. */
  durationMs?: number
  /** Epoch ms when the step started. Drives the live timer while running. */
  startedAt?: number
  /** Retry attempt, shown as "Retry 2 of 3" while retrying. */
  attempt?: { current: number; total?: number }
  /** Retry a failed step. Shows Retry in place: under the step's content, or on the row itself. */
  onRetry?: () => void
  /** Expandable content. Without children the row is static, which keeps long traces light. */
  children?: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function TraceStepMeta({
  status,
  meta,
  durationMs,
  startedAt,
  attempt,
}: Pick<TraceStepProps, "status" | "meta" | "durationMs" | "startedAt" | "attempt">) {
  const { density } = React.useContext(TraceContext)
  if (meta !== undefined)
    return <span className="chatcn-text-12 text-chatcn-fg-subtle">{meta}</span>
  if (status === "running" || status === "approval-responded" || status === "done") {
    // One StepTimer across running and done, so it can measure the step when no duration is given.
    const label = status === "approval-responded" ? "Approved" : "Running"
    return (
      <StepTimer
        running={status !== "done"}
        startedAt={startedAt}
        durationMs={durationMs}
        // Compact rows are usually quick reads: no label flashing for a few hundred ms.
        placeholder={density === "compact" ? null : label}
      />
    )
  }
  if (status === "pending") return null
  let text = STATUS_TEXT[status]
  if (status === "retrying" && attempt) {
    text = attempt.total
      ? `Retry ${attempt.current} of ${attempt.total}`
      : `Retry ${attempt.current}`
  }
  return (
    <span
      className={cn(
        "chatcn-text-12 tabular-nums",
        status === "error" ? "text-chatcn-red" : "text-chatcn-fg-subtle",
      )}
    >
      {text}
    </span>
  )
}

const rowBase = cn(
  "flex h-(--trace-row) w-full min-w-0 items-center gap-2.5 px-2 text-start",
  "rounded-chatcn-md select-none",
)

/**
 * One agent step on the rail: status glyph, label, mono detail, duration. Steps with children
 * expand to show them; the rest render as plain rows with no disclosure machinery.
 */
function TraceStep({
  status,
  label,
  detail,
  icon,
  meta,
  durationMs,
  startedAt,
  attempt,
  onRetry,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
  ...props
}: TraceStepProps) {
  const { density } = React.useContext(TraceContext)
  const quiet = QUIET.includes(status)
  const hasContent = children !== undefined && children !== null && children !== false
  // The panel opens by the status it mounts with (an error opens it); later status changes do not
  // fight an uncontrolled panel. It mounts again whenever content returns.
  const initialOpen = React.useRef<boolean | undefined>(undefined)
  if (!hasContent) initialOpen.current = undefined
  else if (initialOpen.current === undefined)
    initialOpen.current = defaultOpen ?? (status === "error" || status === "approval-requested")
  const retry =
    status === "error" && onRetry ? (
      <Button
        size="xs"
        onClick={onRetry}
        className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 pointer-coarse:after:content-['']"
      >
        <RotateCcwIcon aria-hidden="true" />
        Retry
      </Button>
    ) : null

  const body = (
    <>
      <TraceStatusGlyph status={status} icon={icon} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="sr-only">{STATUS_TEXT[status]}: </span>
        {label ? (
          <span
            className={cn(
              "shrink-0",
              density === "compact" ? "font-normal" : "font-medium",
              quiet ? "text-chatcn-fg-subtle" : "text-chatcn-fg",
            )}
          >
            {label}
          </span>
        ) : null}
        {detail ? (
          <span
            className={cn(
              "truncate font-mono",
              label
                ? "chatcn-text-12 text-chatcn-fg-subtle"
                : "chatcn-text-12 text-chatcn-fg-muted",
              quiet && "text-chatcn-fg-subtle",
            )}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span className="shrink-0">
        <TraceStepMeta
          status={status}
          meta={meta}
          durationMs={durationMs}
          startedAt={startedAt}
          attempt={attempt}
        />
      </span>
    </>
  )

  return (
    <li
      data-slot="trace-step"
      data-trace-status={status}
      className={cn("group/trace-item relative min-w-0", className)}
      {...props}
    >
      <TraceConnector />
      {hasContent ? (
        <Collapsible.Root
          open={open}
          defaultOpen={initialOpen.current}
          onOpenChange={onOpenChange}
          render={<div />}
          className="group/trace-step"
        >
          <Collapsible.Trigger
            className={cn(
              rowBase,
              "ease-chatcn-standard transition-colors duration-150 outline-none",
              "hover:bg-chatcn-fill-hover focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
            )}
          >
            {body}
            <ChevronDownIcon
              aria-hidden="true"
              data-trace-chevron=""
              className={cn(
                "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-[rotate,opacity] duration-200",
                "group-data-[open]/trace-step:rotate-180 motion-reduce:transition-none",
                // The chevron appears on hover so a long trace is not a column of arrows.
                "opacity-0 group-focus-within/trace-step:opacity-100 group-hover/trace-step:opacity-100",
                "group-data-[open]/trace-step:opacity-100 pointer-coarse:opacity-100",
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
            <div
              data-slot="trace-step-content"
              className="border-chatcn-border chatcn-text-13 text-chatcn-fg-muted ms-[15.5px] mt-1 mb-2 border-s ps-[17.5px] pt-0.5"
            >
              {children}
              {retry ? <div className="-ms-2 mt-1.5 flex">{retry}</div> : null}
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : (
        <div className={rowBase}>
          {body}
          {retry ? <span className="-my-1 -me-1 shrink-0">{retry}</span> : null}
          {/* Holds the chevron's slot when any row in the trace has one, so durations line up. */}
          <span
            aria-hidden="true"
            className="hidden size-4 shrink-0 group-has-[[data-trace-chevron]]/trace:block"
          />
        </div>
      )}
    </li>
  )
}

export type { TraceDensity, TraceItemProps, TraceProps, TraceStatus, TraceStepProps }
export { isTraceActive, Trace, TraceConnector, TraceItem, TraceStatusGlyph, TraceStep }
