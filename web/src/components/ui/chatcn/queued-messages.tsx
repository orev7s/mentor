"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { Tooltip } from "@/components/ui/chatcn/tooltip"
import { useChatcnAutoResize } from "@/hooks/use-chatcn-auto-resize"
import { moveItem, useChatcnPlanReorder } from "@/hooks/use-chatcn-plan-reorder"
import {
  ClockIcon,
  GripVerticalIcon,
  NavigationIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

/** `after-run` waits for the run to finish. `steer` goes in at the next step, mid-run. */
type QueuedMode = "after-run" | "steer"

interface QueuedMessage {
  id: string
  text: string
  mode: QueuedMode
  /** `sending` while the runtime delivers it, `failed` when delivery did not work. */
  status?: "queued" | "sending" | "failed"
}

interface QueuedMessagesProps extends Omit<React.ComponentProps<"section">, "onChange"> {
  /** Controlled queue. Use with `onItemsChange`. */
  items?: QueuedMessage[]
  defaultItems?: QueuedMessage[]
  /** Every edit, reorder, mode change, removal and undo comes through here. */
  onItemsChange?: (items: QueuedMessage[]) => void
  /** Retry a message whose delivery failed. */
  onRetry?: (id: string) => void
  /** How long the undo row stays after a removal. Default 5000 ms; paused while hovered or focused. */
  undoMs?: number
}

interface Tombstone {
  key: string
  items: QueuedMessage[]
  /** Row index where the undo row sits, and where the messages come back. */
  index: number
}

type Row =
  | { kind: "item"; key: string; item: QueuedMessage }
  | { kind: "undo"; key: string; stone: Tombstone }

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

const MODE_TEXT: Record<QueuedMode, string> = {
  "after-run": "Send after this run",
  steer: "Steer now",
}

function snippet(text: string, max = 48) {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function isComposing(event: React.KeyboardEvent, composing: boolean) {
  // biome-ignore lint/suspicious/noExplicitAny: keyCode 229 is the only Safari IME signal
  return event.nativeEvent.isComposing || composing || (event.nativeEvent as any).keyCode === 229
}

function buildRows(items: QueuedMessage[], stones: Tombstone[]): Row[] {
  const rows: Row[] = items.map((item) => ({ kind: "item", key: item.id, item }))
  for (const stone of [...stones].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(stone.index, rows.length), 0, { kind: "undo", key: stone.key, stone })
  }
  return rows
}

/* -------------------------------------------------------------------------------------------------
 * Mode toggle
 *
 * The mode is the row's bullet: a clock while the message waits for the run, an arrow in the
 * accent while it steers. Clicking the bullet flips it; the two glyphs trade places with a short
 * scale, fade and blur. Keyboard changes swap instantly.
 * -----------------------------------------------------------------------------------------------*/

const MODE_HINT: Record<QueuedMode, string> = {
  "after-run": "Sends after this run. Click to steer.",
  steer: "Steers at the next step. Click to wait.",
}

function ModeToggle({
  value,
  onChange,
  index,
}: {
  value: QueuedMode
  onChange: (mode: QueuedMode) => void
  index: number
}) {
  const [instant, setInstant] = React.useState(false)
  const steer = value === "steer"
  const glyph = (on: boolean) =>
    cn(
      "col-start-1 row-start-1 size-3.5",
      "ease-chatcn-out transition-[opacity,scale,filter] duration-150 motion-reduce:transition-opacity",
      on ? "scale-100 opacity-100" : "scale-50 opacity-0 blur-[2px] motion-reduce:scale-100",
      instant && "transition-none",
    )
  return (
    <Tooltip content={MODE_HINT[value]}>
      <button
        type="button"
        data-slot="queued-mode"
        aria-pressed={steer}
        aria-label={`Steer message ${index + 1} now`}
        // detail is 0 when Enter or Space clicked it: keyboard changes never animate.
        onClick={(event) => {
          setInstant(event.detail === 0)
          onChange(steer ? "after-run" : "steer")
        }}
        className={cn(
          "chatcn-focus chatcn-press rounded-chatcn-xs grid h-8 w-6 shrink-0 place-items-center",
          "ease-chatcn-standard transition-colors duration-150",
          "hover:bg-chatcn-fill-hover pointer-coarse:h-11 pointer-coarse:w-9",
          steer ? "text-chatcn-accent" : "text-chatcn-fg-subtle hover:text-chatcn-fg",
        )}
      >
        <ClockIcon aria-hidden="true" className={glyph(!steer)} />
        <NavigationIcon aria-hidden="true" className={glyph(steer)} />
      </button>
    </Tooltip>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Row
 * -----------------------------------------------------------------------------------------------*/

interface QueuedRowProps {
  item: QueuedMessage
  index: number
  count: number
  animate: boolean
  dragging: boolean
  itemProps: ReturnType<ReturnType<typeof useChatcnPlanReorder>["getItemProps"]>
  handleProps: ReturnType<ReturnType<typeof useChatcnPlanReorder>["getHandleProps"]>
  onChange: (patch: Partial<QueuedMessage>) => void
  onRemove: () => void
  onRetry?: () => void
}

function QueuedRow({
  item,
  index,
  count,
  animate,
  dragging,
  itemProps,
  handleProps,
  onChange,
  onRemove,
  onRetry,
}: QueuedRowProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(item.text)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const textRef = React.useRef<HTMLButtonElement>(null)
  const composing = React.useRef(false)
  const returnFocus = React.useRef(false)
  useChatcnAutoResize(textareaRef, { value: draft, enabled: editing })
  const sending = item.status === "sending"
  const failed = item.status === "failed"
  const locked = sending

  React.useEffect(() => {
    if (!editing) {
      if (returnFocus.current) textRef.current?.focus({ preventScroll: true })
      returnFocus.current = false
      return
    }
    const el = textareaRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const startEdit = () => {
    if (locked) return
    setDraft(item.text)
    setEditing(true)
  }
  const save = () => {
    returnFocus.current = true
    const text = draft.trim()
    setEditing(false)
    if (text.length === 0) onRemove()
    else if (text !== item.text) onChange({ text })
  }
  const cancel = () => {
    returnFocus.current = true
    setEditing(false)
    setDraft(item.text)
  }

  return (
    <li
      {...itemProps}
      data-slot="queued-message"
      data-mode={item.mode}
      data-queued-status={item.status ?? "queued"}
      data-dragging={dragging ? "" : undefined}
      data-editing={editing ? "" : undefined}
      className={cn(
        "group/queued rounded-chatcn-sm bg-chatcn-card relative flex min-w-0 items-start gap-0.5 py-1 ps-1 pe-1",
        "hover:bg-chatcn-fill/60 focus-within:bg-chatcn-fill/60 data-[editing]:bg-chatcn-fill",
        dragging && "shadow-chatcn-md bg-chatcn-card hover:bg-chatcn-card z-10",
        animate &&
          "ease-chatcn-out-soft transition-[opacity,translate] duration-200 starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0",
      )}
    >
      {sending ? (
        <span className="text-chatcn-blue grid h-8 w-6 shrink-0 place-items-center pointer-coarse:h-11 pointer-coarse:w-9">
          <Spinner className="size-3.5" />
        </span>
      ) : (
        <ModeToggle value={item.mode} index={index} onChange={(mode) => onChange({ mode })} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            aria-label={`Edit queued message ${index + 1}`}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              window.setTimeout(() => {
                composing.current = false
              }, 0)
            }}
            onKeyDown={(event) => {
              if (isComposing(event, composing.current)) return
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                save()
              } else if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                cancel()
              }
            }}
            onBlur={(event) => {
              // Clicking Save or Cancel handles itself; anywhere else saves, like a note app.
              if (event.relatedTarget?.closest("[data-queued-edit-actions]")) return
              if (editing) save()
            }}
            className={cn(
              "chatcn-text-14 text-chatcn-fg max-h-40 min-h-8 w-full resize-none bg-transparent px-1 py-1.5 outline-none",
              "chatcn-scroll field-sizing-content overflow-y-auto",
            )}
          />
        ) : (
          <button
            ref={textRef}
            type="button"
            onClick={startEdit}
            onKeyDown={(event) => {
              if ((event.key === "Backspace" || event.key === "Delete") && !locked) {
                event.preventDefault()
                onRemove()
              }
            }}
            aria-label={`Queued message ${index + 1} of ${count}: ${item.text}. ${MODE_TEXT[item.mode]}. Press Enter to edit, Delete to remove.`}
            disabled={locked}
            className={cn(
              "chatcn-focus rounded-chatcn-xs chatcn-text-14 min-h-8 w-full px-1 py-1.5 text-start",
              "text-pretty [overflow-wrap:anywhere]",
              sending
                ? "text-chatcn-fg-subtle cursor-default"
                : "text-chatcn-fg-muted hover:text-chatcn-fg cursor-text",
              "ease-chatcn-standard transition-colors duration-150",
            )}
          >
            <span className="line-clamp-2">{item.text}</span>
          </button>
        )}
        {failed && !editing ? (
          <p className="chatcn-text-12 text-chatcn-red min-h-5 px-1 pb-1 text-pretty">
            Not delivered. Check your connection, then retry.
          </p>
        ) : null}
      </div>

      {editing ? (
        <div data-queued-edit-actions="" className="flex h-8 shrink-0 items-center gap-1">
          <Button size="xs" onClick={cancel}>
            Cancel
          </Button>
          <Button size="xs" variant="solid" onClick={save}>
            Save
          </Button>
        </div>
      ) : (
        <div className="flex h-8 shrink-0 items-center gap-0.5">
          {sending ? (
            // The row's edit and remove actions leave while it sends, so the label takes the
            // trailing edge every other row's last action sits on.
            <span className="chatcn-text-12 text-chatcn-fg-subtle px-2 tabular-nums">
              {item.mode === "steer" ? "Steering" : "Sending"}
            </span>
          ) : failed && onRetry ? (
            <Tooltip content="Retry">
              <Button
                size="xs"
                variant="outline"
                aria-label={`Retry message ${index + 1}`}
                onClick={onRetry}
              >
                <RotateCcwIcon aria-hidden="true" />
                {/* Narrow queues keep the room for the message; the icon still says retry. */}
                <span className="hidden @[26rem]/queue:inline">Retry</span>
              </Button>
            </Tooltip>
          ) : null}
          <span
            className={cn(
              "ms-1 flex items-center gap-0.5",
              // Always there, faint until the row is in use: nothing jumps and nothing hides.
              "[&_button]:text-chatcn-fg-faint group-focus-within/queued:[&_button]:text-chatcn-fg-subtle group-hover/queued:[&_button]:text-chatcn-fg-subtle",
              sending && "hidden",
            )}
          >
            <Tooltip content="Edit">
              <Button
                size="icon-xs"
                aria-label={`Edit message ${index + 1}`}
                onClick={startEdit}
                className="pointer-coarse:size-11"
              >
                <PencilIcon />
              </Button>
            </Tooltip>
            <Tooltip content="Remove">
              <Button
                size="icon-xs"
                aria-label={`Remove message ${index + 1}`}
                onClick={onRemove}
                className="pointer-coarse:size-11"
              >
                <Trash2Icon />
              </Button>
            </Tooltip>
            <button
              type="button"
              {...handleProps}
              disabled={count < 2}
              className={cn(
                "chatcn-focus rounded-chatcn-xs grid h-8 w-5 cursor-grab touch-none place-items-center active:cursor-grabbing",
                "hover:text-chatcn-fg ease-chatcn-standard transition-colors duration-150",
                "disabled:invisible pointer-coarse:h-11 pointer-coarse:w-8",
              )}
            >
              <GripVerticalIcon aria-hidden="true" className="size-4" />
            </button>
          </span>
        </div>
      )}
    </li>
  )
}

function UndoRow({
  stone,
  itemProps,
  undoMs,
  onUndo,
  onExpire,
}: {
  stone: Tombstone
  itemProps: ReturnType<ReturnType<typeof useChatcnPlanReorder>["getItemProps"]>
  undoMs: number
  onUndo: () => void
  onExpire: () => void
}) {
  const [paused, setPaused] = React.useState(false)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const expire = React.useRef(onExpire)
  expire.current = onExpire

  React.useEffect(() => {
    if (paused) return
    const id = window.setTimeout(() => expire.current(), undoMs)
    return () => window.clearTimeout(id)
  }, [paused, undoMs])

  // Removing with the keyboard puts focus on Undo, so taking it back is one keypress.
  React.useEffect(() => {
    if (document.activeElement === document.body || document.activeElement === null) {
      undoRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const first = stone.items[0]
  const label =
    stone.items.length === 1 && first
      ? `Removed “${snippet(first.text)}”`
      : `Removed ${stone.items.length} messages`

  return (
    <li
      {...itemProps}
      data-slot="queued-undo"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "rounded-chatcn-sm flex min-h-10 min-w-0 items-center gap-2 py-1 ps-2 pe-1",
        "ease-chatcn-out transition-opacity duration-150 starting:opacity-0",
      )}
    >
      <span className="chatcn-text-13 text-chatcn-fg-subtle min-w-0 flex-1 truncate">{label}</span>
      <Button ref={undoRef} size="xs" onClick={onUndo}>
        <RotateCcwIcon aria-hidden="true" />
        Undo
      </Button>
    </li>
  )
}

/* -------------------------------------------------------------------------------------------------
 * QueuedMessages
 * -----------------------------------------------------------------------------------------------*/

/**
 * Messages the user typed while the agent works, held in a visible queue above the composer.
 * Each one says when it goes in: after this run, or now, to steer the agent at its next step.
 * Edit in place, drag or arrow-key to reorder, remove with undo.
 */
function QueuedMessages({
  items: itemsProp,
  defaultItems = [],
  onItemsChange,
  onRetry,
  undoMs = 5000,
  className,
  ...props
}: QueuedMessagesProps) {
  const [itemsState, setItemsState] = React.useState(defaultItems)
  const items = itemsProp ?? itemsState
  const [stones, setStones] = React.useState<Tombstone[]>([])
  const [initialIds] = React.useState(() => new Set(items.map((i) => i.id)))
  const [message, setMessage] = React.useState("")
  const headingId = React.useId()

  const commit = (next: QueuedMessage[]) => {
    if (itemsProp === undefined) setItemsState(next)
    onItemsChange?.(next)
  }

  // Undo rows only make sense for messages that are still gone.
  const liveIds = new Set(items.map((i) => i.id))
  const visibleStones = stones.filter((s) => s.items.some((i) => !liveIds.has(i.id)))
  const rows = buildRows(items, visibleStones)
  const rowKeys = rows.map((r) => r.key)

  const reorder = useChatcnPlanReorder({
    ids: rowKeys,
    fixed: visibleStones.map((s) => s.key),
    noun: "message",
    label: (key) => {
      const i = items.findIndex((it) => it.id === key)
      return `${i + 1}, ${snippet(items[i]?.text ?? "", 32)}`
    },
    onMove: (from, to) => {
      const moved = moveItem(rows, from, to)
      setStones((prev) =>
        prev.map((s) => {
          const at = moved.findIndex((r) => r.key === s.key)
          return at === -1 ? s : { ...s, index: at }
        }),
      )
      commit(moved.flatMap((r) => (r.kind === "item" ? [r.item] : [])))
    },
  })

  const remove = (ids: string[]) => {
    const gone = items.filter((i) => ids.includes(i.id))
    if (gone.length === 0) return
    const index = rows.findIndex((r) => r.kind === "item" && ids.includes(r.item.id))
    const key = `undo-${gone.map((g) => g.id).join("-")}`
    setStones((prev) => [...prev.filter((s) => s.key !== key), { key, items: gone, index }])
    commit(items.filter((i) => !ids.includes(i.id)))
    setMessage(
      gone.length === 1
        ? "Message removed. Undo is available."
        : `${gone.length} messages removed. Undo is available.`,
    )
  }

  const undo = (stone: Tombstone) => {
    setStones((prev) => prev.filter((s) => s.key !== stone.key))
    const back = stone.items.filter((i) => !liveIds.has(i.id))
    // Put them back where the undo row sits, counted in messages rather than rows.
    const before = rows
      .slice(
        0,
        rows.findIndex((r) => r.key === stone.key),
      )
      .filter((r) => r.kind === "item").length
    const next = [...items.slice(0, before), ...back, ...items.slice(before)]
    commit(next)
    setMessage(back.length === 1 ? "Message restored." : `${back.length} messages restored.`)
  }

  if (rows.length === 0) return null

  const steering = items.filter((i) => i.mode === "steer").length
  const hint =
    steering === 0
      ? "Sends when the agent finishes this run."
      : steering === items.length
        ? "Goes in at the agent's next step."
        : "Steering goes in at the next step. The rest waits for this run."

  return (
    <section
      aria-labelledby={headingId}
      data-slot="queued-messages"
      className={cn(
        "chatcn-text-14 text-chatcn-fg rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm @container/queue flex min-w-0 flex-col",
        "ease-chatcn-out-soft transition-[opacity,translate] duration-200 starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0",
        className,
      )}
      {...props}
    >
      {/* The title lines up with the message text; the row bullets hang in the margin. */}
      <header className="flex h-9 min-w-0 items-center gap-2 ps-10 pe-1.5 pointer-coarse:ps-13">
        <h3
          id={headingId}
          className="chatcn-text-13 text-chatcn-fg shrink-0 font-medium tabular-nums"
        >
          {items.length} queued
        </h3>
        <p className="chatcn-text-12 text-chatcn-fg-subtle hidden min-w-0 flex-1 truncate @[26rem]/queue:block">
          {hint}
        </p>
        {items.length > 1 ? (
          <Button
            size="xs"
            onClick={() => remove(items.filter((i) => i.status !== "sending").map((i) => i.id))}
            className="ms-auto shrink-0"
          >
            Clear
          </Button>
        ) : null}
      </header>
      <ol aria-labelledby={headingId} className="relative flex flex-col gap-0.5 px-1.5 pb-1.5">
        {rows.map((row) => {
          if (row.kind === "undo") {
            return (
              <UndoRow
                key={row.key}
                stone={row.stone}
                itemProps={reorder.getItemProps(row.key)}
                undoMs={undoMs}
                onUndo={() => undo(row.stone)}
                onExpire={() => setStones((prev) => prev.filter((s) => s.key !== row.key))}
              />
            )
          }
          const index = items.findIndex((i) => i.id === row.item.id)
          return (
            <QueuedRow
              key={row.key}
              item={row.item}
              index={index}
              count={items.length}
              animate={!initialIds.has(row.item.id)}
              dragging={reorder.draggingId === row.key}
              itemProps={reorder.getItemProps(row.key)}
              handleProps={reorder.getHandleProps(row.key)}
              onChange={(patch) =>
                commit(items.map((i) => (i.id === row.item.id ? { ...i, ...patch } : i)))
              }
              onRemove={() => remove([row.item.id])}
              onRetry={onRetry ? () => onRetry(row.item.id) : undefined}
            />
          )
        })}
      </ol>
      <span aria-live="polite" className="sr-only">
        {reorder.announcement || message}
      </span>
    </section>
  )
}

export type { QueuedMessage, QueuedMessagesProps, QueuedMode }
export { QueuedMessages }
