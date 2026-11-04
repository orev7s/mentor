"use client"

import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import {
  isTaskSettled,
  TASK_STATUS_TEXT,
  type TaskStatus,
  TaskStatusGlyph,
} from "@/components/ui/chatcn/task"
import { ChevronDownIcon, ListChecksIcon, RotateCcwIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface TodoItem {
  id: string
  /** Imperative form: "Run the test suite". */
  title: string
  /** Present continuous form shown while in progress: "Running the test suite". */
  activeTitle?: string
  status: TaskStatus
  /** A second line in small text, for example why a todo is blocked. */
  detail?: React.ReactNode
}

type TodoListVariant = "card" | "compact"

interface TodoListProps extends Omit<React.ComponentProps<"div">, "title"> {
  items: TodoItem[]
  /** Heading. Defaults to "Todos". */
  title?: React.ReactNode
  /** `card` is a standalone surface with a progress rail; `compact` drops into a trace or rail. */
  variant?: TodoListVariant
  /** The agent is still writing the list. Shows a quiet "Writing todos" row after the items. */
  loading?: boolean
  /**
   * Fold the list to one line that shows what is happening now: the pinned-above-the-composer
   * pattern. Works controlled (`open`) or uncontrolled (`defaultOpen`, true by default).
   */
  collapsible?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Shown when there are no items and nothing is loading. */
  empty?: React.ReactNode
  /** Retry a failed todo. Shows Retry on that row, in place. Receives the todo id. */
  onRetryItem?: (id: string) => void
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** Ids present on first render. Only todos added later fade in, so restored lists mount still. */
function useInitialIds(ids: string[]) {
  const [initial] = React.useState(() => new Set(ids))
  return initial
}

/**
 * Screen reader feedback for a live list: one polite sentence when a todo finishes or starts,
 * never a re-read of the whole list.
 */
function useTodoAnnouncement(items: TodoItem[]) {
  const previous = React.useRef(new Map(items.map((i) => [i.id, i.status])))
  const [message, setMessage] = React.useState("")
  React.useEffect(() => {
    const done = items.filter((i) => i.status === "done").length
    let next = ""
    for (const item of items) {
      const was = previous.current.get(item.id)
      if (was === undefined || was === item.status) continue
      if (item.status === "done") next = `Done: ${item.title}. ${done} of ${items.length} done.`
      else if (item.status === "in-progress") next = `Started: ${item.activeTitle ?? item.title}.`
      else next = `${TASK_STATUS_TEXT[item.status]}: ${item.title}.`
    }
    previous.current = new Map(items.map((i) => [i.id, i.status]))
    if (next) setMessage(next)
  }, [items])
  return message
}

/* -------------------------------------------------------------------------------------------------
 * Progress
 * -----------------------------------------------------------------------------------------------*/

/**
 * Progress as one hairline segment per todo: you can count what is left at a glance. Past 12
 * todos the segments would turn to dust, so it becomes one continuous rail.
 */
function TodoProgress({ items }: { items: TodoItem[] }) {
  if (items.length === 0) return null
  if (items.length > 12) {
    const settled = items.filter((i) => isTaskSettled(i.status)).length
    return (
      <span
        aria-hidden="true"
        className="bg-chatcn-fill-active block h-0.5 overflow-hidden rounded-full"
      >
        <span
          className="bg-chatcn-accent ease-chatcn-out block h-full origin-left transition-transform duration-300 motion-reduce:transition-none rtl:origin-right"
          style={{ transform: `scaleX(${settled / items.length})` }}
        />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className="flex h-0.5 gap-0.5">
      {items.map((item) => (
        <span
          key={item.id}
          className={cn(
            "h-full flex-1 rounded-full transition-colors duration-150 motion-reduce:transition-none",
            item.status === "done" && "bg-chatcn-accent",
            item.status === "in-progress" && "bg-chatcn-fg-faint",
            (item.status === "skipped" || item.status === "cancelled") && "bg-chatcn-border-strong",
            item.status === "failed" && "bg-chatcn-red",
            (item.status === "pending" || item.status === "blocked") && "bg-chatcn-fill-active",
          )}
        />
      ))}
    </span>
  )
}

/** "3 of 7" in tabular figures, so the width never jitters as the count climbs. */
function TodoCount({ items, className }: { items: TodoItem[]; className?: string }) {
  const done = items.filter((i) => i.status === "done").length
  return (
    <span
      data-slot="todo-count"
      className={cn("chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums", className)}
    >
      {done} of {items.length}
      <span className="sr-only"> done</span>
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Row
 * -----------------------------------------------------------------------------------------------*/

function TodoRow({
  item,
  compact,
  animate,
  onRetry,
}: {
  item: TodoItem
  compact: boolean
  animate: boolean
  onRetry?: () => void
}) {
  const { status } = item
  const active = status === "in-progress"
  const struck = status === "done" || status === "skipped" || status === "cancelled"
  return (
    <li
      data-slot="todo-item"
      data-task-status={status}
      className={cn(
        "flex min-w-0 items-start gap-2.5",
        compact ? "py-1" : "px-1 py-1.5",
        animate && "ease-chatcn-out-soft transition-opacity duration-200 starting:opacity-0",
      )}
    >
      {/* The glyph centers on the first line of text, whatever the line height. */}
      <span className="flex h-5 shrink-0 items-center">
        <TaskStatusGlyph status={status} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-pretty",
            "ease-chatcn-standard transition-[color,text-decoration-color] duration-150 motion-reduce:transition-none",
            active ? "text-chatcn-fg font-medium" : "text-chatcn-fg",
            struck && "text-chatcn-fg-subtle decoration-chatcn-fg-faint line-through decoration-1",
            status === "pending" && "text-chatcn-fg-muted",
          )}
        >
          <span className="sr-only">{TASK_STATUS_TEXT[status]}: </span>
          {active && item.activeTitle ? item.activeTitle : item.title}
        </span>
        {item.detail ? (
          <span className="chatcn-text-12 text-chatcn-fg-subtle text-pretty">{item.detail}</span>
        ) : null}
      </span>
      {status === "failed" && onRetry ? (
        // The retry sits on the row that failed; the -my keeps the row at its height.
        <Button
          size="xs"
          onClick={onRetry}
          className="relative -my-0.5 shrink-0 self-start pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 pointer-coarse:after:content-['']"
        >
          <RotateCcwIcon aria-hidden="true" />
          Retry
          <span className="sr-only">: {item.title}</span>
        </Button>
      ) : null}
    </li>
  )
}

/* -------------------------------------------------------------------------------------------------
 * TodoList
 * -----------------------------------------------------------------------------------------------*/

/**
 * The agent's checklist. A ring waits, a spinner works, an ink disc with a drawn check is done.
 * The count reads "3 of 7" and updates in place; screen readers hear one sentence per change.
 */
function TodoList({
  items,
  title = "Todos",
  variant = "card",
  loading = false,
  collapsible = false,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  empty = "The agent's checklist shows up here once it plans the work.",
  onRetryItem,
  className,
  ...props
}: TodoListProps) {
  const compact = variant === "compact"
  const initial = useInitialIds(items.map((i) => i.id))
  const announcement = useTodoAnnouncement(items)
  const [openState, setOpenState] = React.useState(defaultOpen)
  const open = collapsible ? (openProp ?? openState) : true
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }

  const current =
    items.find((i) => i.status === "in-progress") ??
    items.find((i) => i.status === "blocked") ??
    items.find((i) => i.status === "pending")
  const allDone = items.length > 0 && items.every((i) => isTaskSettled(i.status))

  const list =
    items.length === 0 && !loading ? (
      <p className={cn("chatcn-text-13 text-chatcn-fg-subtle", compact ? "py-1" : "px-1 py-1.5")}>
        {empty}
      </p>
    ) : (
      <ul aria-label={typeof title === "string" ? title : "Todos"} className="flex flex-col">
        {items.map((item) => (
          <TodoRow
            key={item.id}
            item={item}
            compact={compact}
            animate={!initial.has(item.id)}
            onRetry={onRetryItem ? () => onRetryItem(item.id) : undefined}
          />
        ))}
        {loading ? (
          <li className={cn("flex items-center gap-2.5", compact ? "py-1" : "px-1 py-1.5")}>
            <span className="size-4 shrink-0" />
            <ShimmerText className="chatcn-text-13">Writing todos</ShimmerText>
          </li>
        ) : null}
      </ul>
    )

  /** What the folded header shows: the todo in progress, else the title. */
  const summary =
    collapsible && !open && current ? (
      <span className="flex min-w-0 items-center gap-2.5">
        <TaskStatusGlyph status={current.status} />
        <span key={current.id} className="text-chatcn-fg truncate font-medium">
          {current.status === "in-progress" && current.activeTitle
            ? current.activeTitle
            : current.title}
        </span>
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-2.5">
        <ListChecksIcon aria-hidden="true" className="text-chatcn-fg-subtle size-4 shrink-0" />
        <span className="text-chatcn-fg truncate font-medium">
          {allDone && items.length > 0 ? "All done" : title}
        </span>
      </span>
    )

  const headerInner = (
    <>
      <span className="min-w-0 flex-1">{summary}</span>
      {items.length > 0 ? <TodoCount items={items} /> : null}
      {collapsible ? (
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open ? "rotate-180" : "",
          )}
        />
      ) : null}
    </>
  )

  const headerClass = cn(
    "flex w-full min-w-0 items-center gap-2.5 text-start",
    compact ? "h-7" : "h-10 px-4",
  )

  return (
    <div
      data-slot="todo-list"
      data-variant={variant}
      className={cn(
        "text-chatcn-fg flex min-w-0 flex-col",
        compact ? "chatcn-text-13" : "chatcn-text-14",
        !compact && "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm overflow-hidden",
        className,
      )}
      {...props}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen} disabled={!collapsible} render={<div />}>
        {collapsible ? (
          <Collapsible.Trigger
            className={cn(
              headerClass,
              "ease-chatcn-standard transition-colors duration-150 outline-none select-none",
              "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
              compact
                ? "rounded-chatcn-sm hover:bg-chatcn-fill-hover -mx-1 w-[calc(100%+0.5rem)] px-1"
                : "hover:bg-chatcn-alpha-100",
              "pointer-coarse:min-h-11",
            )}
          >
            {headerInner}
          </Collapsible.Trigger>
        ) : (
          <div className={headerClass}>{headerInner}</div>
        )}
        <div className={cn(compact ? "pb-1.5" : "px-4 pb-2")}>
          <TodoProgress items={items} />
        </div>
        <Collapsible.Panel
          className={cn(
            "h-(--collapsible-panel-height) overflow-hidden",
            "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
            "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
            "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
          )}
        >
          <div className={cn(compact ? "pt-0.5" : "px-3 pb-2.5")}>{list}</div>
        </Collapsible.Panel>
      </Collapsible.Root>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

export type { TodoItem, TodoListProps, TodoListVariant }
export { TodoCount, TodoList, TodoProgress }
