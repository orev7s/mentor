"use client"

import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { StepTimer } from "@/components/ui/chatcn/step-timer"
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleMinusIcon,
  CircleStopIcon,
  CircleXIcon,
  RotateCcwIcon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Status
 *
 * One vocabulary for plan steps, todos and tasks. It maps one to one onto Claude Code TodoWrite
 * (`pending`, `in_progress`, `completed`) and adds the states a real run also hits.
 * -----------------------------------------------------------------------------------------------*/

type TaskStatus =
  | "pending"
  | "in-progress"
  | "done"
  | "blocked"
  | "skipped"
  | "failed"
  | "cancelled"

const TASK_STATUS_TEXT: Record<TaskStatus, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  done: "Done",
  blocked: "Blocked",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** Statuses that end a task. Everything else still has work ahead of it. */
function isTaskSettled(status: TaskStatus) {
  return status === "done" || status === "skipped" || status === "failed" || status === "cancelled"
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  )
}

/**
 * Remembers whether a value has changed since mount, so a list of 40 finished todos mounts still
 * and only a todo that finishes while you watch plays its check.
 */
function useChangedSinceMount<T>(value: T) {
  const first = React.useRef(value)
  const changed = React.useRef(false)
  if (!Object.is(value, first.current)) changed.current = true
  return changed.current
}

/**
 * The check inside the done disc. When it appears after a real change it draws itself with a
 * 180 ms stroke, the one moment of reward in a plan. Static under reduced motion.
 */
function DrawnCheck({ draw }: { draw: boolean }) {
  const ref = React.useRef<SVGSVGElement>(null)
  React.useLayoutEffect(() => {
    if (!draw || prefersReducedMotion()) return
    const path = ref.current?.querySelector("path")
    if (!path || typeof path.animate !== "function") return
    const length = path.getTotalLength()
    const animation = path.animate(
      [
        { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
        { strokeDasharray: `${length}`, strokeDashoffset: "0" },
      ],
      { duration: 180, delay: 40, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "backwards" },
    )
    return () => animation.cancel()
  }, [draw])
  return <CheckIcon ref={ref} absoluteStrokeWidth strokeWidth={1.75} className="size-2.5" />
}

interface TaskStatusGlyphProps {
  status: TaskStatus
  className?: string
}

/**
 * A 16 px status glyph built on one 14 px circle: a ring waiting, a spinner working, an ink disc
 * with a check when done. Blocked, skipped, failed and cancelled use circled icons of the same
 * size, so a column of mixed states stays perfectly aligned.
 */
function TaskStatusGlyph({ status, className }: TaskStatusGlyphProps) {
  const changed = useChangedSinceMount(status)
  let glyph: React.ReactNode
  let tone = "text-chatcn-fg-subtle"

  switch (status) {
    case "in-progress":
      glyph = <Spinner className="size-3.5" />
      tone = "text-chatcn-blue"
      break
    case "done":
      glyph = (
        <span className="bg-chatcn-green text-chatcn-bg grid size-3.5 place-items-center rounded-full">
          <DrawnCheck draw={changed} />
        </span>
      )
      break
    case "blocked":
      glyph = <CircleMinusIcon className="size-4" />
      tone = "text-chatcn-amber"
      break
    case "skipped":
      glyph = <CircleDashedIcon className="size-4" />
      tone = "text-chatcn-fg-faint"
      break
    case "failed":
      glyph = <CircleXIcon className="size-4" />
      tone = "text-chatcn-red"
      break
    case "cancelled":
      glyph = <CircleStopIcon className="size-4" />
      break
    default:
      glyph = (
        <span className="size-3.5 rounded-full shadow-[inset_0_0_0_1.5px_var(--chatcn-border-strong)]" />
      )
  }

  return (
    <span
      aria-hidden="true"
      data-slot="task-status"
      data-task-status={status}
      className={cn("relative grid size-4 shrink-0 place-items-center", tone, className)}
    >
      <span
        key={status}
        className={cn(
          "grid place-items-center",
          changed && "motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]",
        )}
      >
        {glyph}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Task
 * -----------------------------------------------------------------------------------------------*/

interface TaskProps extends Omit<React.ComponentProps<"div">, "title"> {
  status: TaskStatus
  /** What the task does, in the imperative: "Run the test suite". */
  title: React.ReactNode
  /** Shown instead of `title` while in progress: "Running the test suite". */
  activeTitle?: React.ReactNode
  /** Mono context after the title: a path, a command, a reason it is blocked. Truncates. */
  detail?: React.ReactNode
  /** Replaces the timer or status text at the end of the row. */
  meta?: React.ReactNode
  /** Final duration in ms, shown once done. */
  durationMs?: number
  /** Epoch ms when the task started. Drives the live timer. Measured when omitted. */
  startedAt?: number
  /** Retry a failed task. Shows Retry in place: under its details, or on the row itself. */
  onRetry?: () => void
  /** Expandable details. Without children the row is static. */
  children?: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function TaskMeta({
  status,
  meta,
  durationMs,
  startedAt,
}: Pick<TaskProps, "status" | "meta" | "durationMs" | "startedAt">) {
  if (meta !== undefined) {
    return <span className="chatcn-text-12 text-chatcn-fg-subtle tabular-nums">{meta}</span>
  }
  if (status === "in-progress" || status === "done") {
    // One timer across in progress and done, so it can measure the task when no duration is given.
    return (
      <StepTimer running={status === "in-progress"} startedAt={startedAt} durationMs={durationMs} />
    )
  }
  if (status === "pending") return null
  return (
    <span
      className={cn(
        "chatcn-text-12",
        status === "failed" ? "text-chatcn-red" : "text-chatcn-fg-subtle",
      )}
    >
      {TASK_STATUS_TEXT[status]}
    </span>
  )
}

const rowBase = "flex min-h-9 w-full min-w-0 items-center gap-2.5 px-2 py-1.5 text-start"

/**
 * One task: status, title, mono detail, duration, and details on demand. The building block for
 * todo lists, plan steps and anything else that runs.
 */
function Task({
  status,
  title,
  activeTitle,
  detail,
  meta,
  durationMs,
  startedAt,
  onRetry,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
  ...props
}: TaskProps) {
  const hasContent = children !== undefined && children !== null && children !== false
  // The panel opens by the status it mounts with (an error opens it); later status changes do not
  // fight an uncontrolled panel. It mounts again whenever content returns.
  const initialOpen = React.useRef<boolean | undefined>(undefined)
  if (!hasContent) initialOpen.current = undefined
  else if (initialOpen.current === undefined)
    initialOpen.current = defaultOpen ?? (status === "failed" || status === "blocked")
  const quiet = status === "pending" || status === "skipped" || status === "cancelled"
  const shownTitle = status === "in-progress" && activeTitle ? activeTitle : title
  const retry =
    status === "failed" && onRetry ? (
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
      <TaskStatusGlyph status={status} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="sr-only">{TASK_STATUS_TEXT[status]}: </span>
        <span
          className={cn(
            "min-w-0 truncate",
            status === "in-progress" ? "text-chatcn-fg font-medium" : "font-normal",
            status === "done" && "text-chatcn-fg-muted",
            quiet && "text-chatcn-fg-subtle",
            (status === "blocked" || status === "failed") && "text-chatcn-fg",
          )}
        >
          {shownTitle}
        </span>
        {detail ? (
          <span className="chatcn-text-12 text-chatcn-fg-subtle min-w-0 shrink-[2] truncate font-mono">
            {detail}
          </span>
        ) : null}
      </span>
      <span className="shrink-0">
        <TaskMeta status={status} meta={meta} durationMs={durationMs} startedAt={startedAt} />
      </span>
    </>
  )

  return (
    <div
      data-slot="task"
      data-task-status={status}
      data-task-expandable={hasContent ? "" : undefined}
      className={cn("group/task chatcn-text-14 text-chatcn-fg min-w-0", className)}
      {...props}
    >
      {hasContent ? (
        <Collapsible.Root
          open={open}
          defaultOpen={initialOpen.current}
          onOpenChange={onOpenChange}
          render={<div />}
          className="group/task-disclosure"
        >
          <Collapsible.Trigger
            className={cn(
              rowBase,
              "rounded-chatcn-md ease-chatcn-standard transition-colors duration-150 outline-none select-none",
              "hover:bg-chatcn-fill-hover focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
              "pointer-coarse:min-h-11",
            )}
          >
            {body}
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-transform duration-200",
                "motion-reduce:transition-none [[data-panel-open]>&]:rotate-180",
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
              data-slot="task-content"
              className="chatcn-text-13 text-chatcn-fg-muted ps-[2.125rem] pe-2 pt-0.5 pb-2.5 text-pretty"
            >
              {children}
              {retry ? <div className="-ms-2 mt-1.5 flex">{retry}</div> : null}
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : (
        <div
          className={cn(
            rowBase,
            // In a list where some rows expand, static rows keep the chevron's slot so every
            // timer and status lines up on the same right edge.
            "[:has(>[data-task-expandable])>*>&]:pe-[2.125rem]",
          )}
        >
          {body}
          {retry ? <span className="-my-1 -me-1 shrink-0">{retry}</span> : null}
        </div>
      )}
    </div>
  )
}

export type { TaskProps, TaskStatus, TaskStatusGlyphProps }
export { isTaskSettled, TASK_STATUS_TEXT, Task, TaskStatusGlyph }
