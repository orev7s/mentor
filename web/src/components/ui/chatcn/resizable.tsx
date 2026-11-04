import * as React from "react"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type Direction = "horizontal" | "vertical"

/** A size: a number is a percentage of the group, a string like `"360px"` is pixels. */
type ResizableSize = number | `${number}px`

interface PanelConfig {
  id: string
  defaultSize?: ResizableSize
  minSize?: ResizableSize
  maxSize?: ResizableSize
  collapsible?: boolean
  collapsedSize?: ResizableSize
  onCollapsedChange?: (collapsed: boolean) => void
}

interface ResizablePanelHandle {
  collapse: () => void
  expand: () => void
  /** Resize to a percentage or pixel size. */
  resize: (size: ResizableSize) => void
  isCollapsed: () => boolean
  getSize: () => number
}

interface GroupContextValue {
  direction: Direction
  register: (config: PanelConfig) => () => void
  update: (config: PanelConfig) => void
  sizes: Record<string, number>
  collapsed: Record<string, boolean>
  dragging: string | null
  /** Bumps whenever panels mount or unmount so handles can find their neighbors. */
  version: number
  api: {
    getGroup: () => HTMLDivElement | null
    getConfig: (id: string) => PanelConfig | undefined
    getSizes: () => Record<string, number>
    bounds: (id: string) => { min: number; max: number; collapsed: number }
    setPair: (a: string, b: string, nextA: number, snap?: boolean) => void
    resetPair: (a: string, b: string) => void
    toggleCollapse: (id: string, partner?: string) => void
    resize: (id: string, size: number) => void
    setDragging: (handleId: string | null) => void
  }
}

const GroupContext = React.createContext<GroupContextValue | null>(null)

function useGroup(part: string) {
  const ctx = React.useContext(GroupContext)
  if (!ctx) throw new Error(`<${part}> must be used inside <ResizableGroup>.`)
  return ctx
}

/* -------------------------------------------------------------------------------------------------
 * Layout math. Everything is stored as percentages that sum to 100.
 * -----------------------------------------------------------------------------------------------*/

const EPS = 0.01

function toPercent(size: ResizableSize | undefined, groupPx: number, fallback: number) {
  if (size === undefined) return fallback
  if (typeof size === "number") return size
  const px = Number.parseFloat(size)
  return groupPx > 0 ? (px / groupPx) * 100 : fallback
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

/**
 * Clamp every panel into its bounds, then hand the leftover (or the deficit) to panels that still
 * have room, last panel first. Collapsed panels hold their collapsed size.
 */
function settle(
  order: string[],
  sizes: Record<string, number>,
  bounds: (id: string) => { min: number; max: number; collapsed: number },
  collapsed: Record<string, boolean>,
) {
  const next: Record<string, number> = {}
  for (const id of order) {
    const b = bounds(id)
    const value = sizes[id] ?? 100 / order.length
    next[id] = collapsed[id] ? b.collapsed : Math.min(b.max, Math.max(b.min, value))
  }
  let diff = 100 - order.reduce((sum, id) => sum + (next[id] ?? 0), 0)
  for (let pass = 0; pass < 2 && Math.abs(diff) > EPS; pass++) {
    for (const id of [...order].reverse()) {
      if (collapsed[id] && pass === 0) continue
      const b = bounds(id)
      const current = next[id] ?? 0
      const room = diff > 0 ? b.max - current : current - b.min
      if (room <= 0 && pass === 0) continue
      const take = pass === 0 ? Math.sign(diff) * Math.min(Math.abs(diff), room) : diff
      next[id] = current + take
      diff -= take
      if (Math.abs(diff) <= EPS) break
    }
  }
  for (const id of order) next[id] = round(next[id] ?? 0)
  return next
}

function sameSizes(a: Record<string, number>, b: Record<string, number>) {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < EPS)
}

/* -------------------------------------------------------------------------------------------------
 * Global drag style: one cursor everywhere and no iframe stealing the pointer.
 * -----------------------------------------------------------------------------------------------*/

let dragStyle: HTMLStyleElement | null = null

function setGlobalCursor(cursor: string | null) {
  if (typeof document === "undefined") return
  if (cursor === null) {
    dragStyle?.remove()
    dragStyle = null
    return
  }
  if (!dragStyle) {
    dragStyle = document.createElement("style")
    document.head.appendChild(dragStyle)
  }
  dragStyle.textContent = `*{cursor:${cursor}!important;user-select:none!important}iframe{pointer-events:none!important}`
}

/* -------------------------------------------------------------------------------------------------
 * ResizableGroup
 * -----------------------------------------------------------------------------------------------*/

interface ResizableGroupProps extends React.ComponentProps<"div"> {
  direction?: Direction
  /** Called with panel sizes in percent, in DOM order, after every change. */
  onLayout?: (sizes: number[]) => void
  /** Persist the layout in localStorage under this key. */
  autoSaveId?: string
}

function readSaved(key?: string): Record<string, number> | null {
  if (!key || typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(`chatcn-resizable:${key}`)
    return raw ? (JSON.parse(raw) as Record<string, number>) : null
  } catch {
    return null
  }
}

function ResizableGroup({
  direction = "horizontal",
  onLayout,
  autoSaveId,
  className,
  style,
  children,
  ref,
  ...props
}: ResizableGroupProps) {
  const groupRef = React.useRef<HTMLDivElement>(null)
  const configs = React.useRef(new Map<string, PanelConfig>())
  const [order, setOrder] = React.useState<string[]>([])
  const [sizes, setSizes] = React.useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  const [groupPx, setGroupPx] = React.useState(0)
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)
  const saved = React.useRef(readSaved(autoSaveId))

  // Latest values for event handlers, which outlive renders.
  const live = React.useRef({ order, sizes, collapsed, groupPx })
  live.current = { order, sizes, collapsed, groupPx }

  const bounds = React.useCallback((id: string) => {
    const config = configs.current.get(id)
    const px = live.current.groupPx
    const min = toPercent(config?.minSize, px, 0)
    const max = toPercent(config?.maxSize, px, 100)
    return {
      min: Math.min(min, 100),
      max: Math.max(min, max),
      collapsed: toPercent(config?.collapsedSize, px, 0),
    }
  }, [])

  const commit = React.useCallback(
    (nextSizes: Record<string, number>) => {
      const settled = settle(live.current.order, nextSizes, bounds, live.current.collapsed)
      setSizes((prev) => (sameSizes(prev, settled) ? prev : settled))
      return settled
    },
    [bounds],
  )

  const setCollapsedFor = React.useCallback((id: string, value: boolean) => {
    if (Boolean(live.current.collapsed[id]) === value) return
    live.current.collapsed = { ...live.current.collapsed, [id]: value }
    setCollapsed(live.current.collapsed)
    configs.current.get(id)?.onCollapsedChange?.(value)
  }, [])

  // Measure the group so pixel constraints can be turned into percentages.
  React.useLayoutEffect(() => {
    const el = groupRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setGroupPx(direction === "horizontal" ? rect.width : rect.height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [direction])

  // Re-settle when panels change or the group resizes: pixel minimums shift in percent terms.
  React.useLayoutEffect(() => {
    if (order.length === 0) return
    const current = live.current.sizes
    const known = order.filter((id) => current[id] !== undefined)
    const fresh = order.filter((id) => current[id] === undefined)
    const next: Record<string, number> = {}
    // New panels take their default (or saved) size; existing panels share what is left.
    let freshTotal = 0
    for (const id of fresh) {
      const config = configs.current.get(id)
      const stored = saved.current?.[id]
      const value =
        stored ?? toPercent(config?.defaultSize, groupPx, 100 / Math.max(order.length, 1))
      next[id] = value
      freshTotal += value
    }
    const knownTotal = known.reduce((sum, id) => sum + (current[id] ?? 0), 0)
    const room = Math.max(0, 100 - freshTotal)
    for (const id of known) {
      next[id] = knownTotal > 0 ? ((current[id] ?? 0) / knownTotal) * room : room / known.length
    }
    commit(next)
  }, [order, groupPx])

  React.useEffect(() => {
    if (order.length === 0 || order.some((id) => sizes[id] === undefined)) return
    onLayout?.(order.map((id) => sizes[id] ?? 0))
    // Remember sizes of panels that unmount, so a reopened panel comes back at its last width.
    saved.current = { ...saved.current, ...sizes }
    if (autoSaveId) {
      try {
        window.localStorage.setItem(`chatcn-resizable:${autoSaveId}`, JSON.stringify(saved.current))
      } catch {
        // Storage can be unavailable (private mode). The layout still works.
      }
    }
  }, [sizes, order, onLayout, autoSaveId])

  // Panels are ordered by DOM position, so conditional panels slot in where they render.
  const sort = React.useCallback(() => {
    const el = groupRef.current
    if (!el) return
    const ids = Array.from(
      el.querySelectorAll<HTMLElement>(":scope > [data-slot='resizable-panel']"),
    ).map((node) => node.dataset.panelId as string)
    setOrder((prev) => (prev.join() === ids.join() ? prev : ids))
    setVersion((v) => v + 1)
  }, [])

  // Child layout effects run before this group's ref attaches, so the first sort happens here.
  React.useLayoutEffect(() => sort(), [sort])

  const register = React.useCallback(
    (config: PanelConfig) => {
      configs.current.set(config.id, config)
      sort()
      return () => {
        configs.current.delete(config.id)
        setSizes((prev) => {
          if (!(config.id in prev)) return prev
          const { [config.id]: _removed, ...rest } = prev
          return rest
        })
        // Wait for the node to leave the DOM before re-reading the order.
        queueMicrotask(sort)
      }
    },
    [sort],
  )

  const update = React.useCallback((config: PanelConfig) => {
    configs.current.set(config.id, config)
  }, [])

  const api = React.useMemo<GroupContextValue["api"]>(
    () => ({
      getGroup: () => groupRef.current,
      getConfig: (id) => configs.current.get(id),
      getSizes: () => live.current.sizes,
      bounds,
      setPair(a, b, nextA, snap = true) {
        const current = live.current.sizes
        const total = (current[a] ?? 0) + (current[b] ?? 0)
        const ba = bounds(a)
        const bb = bounds(b)
        const clampA = (v: number) => Math.min(ba.max, Math.max(ba.min, v))
        const clampB = (v: number) => Math.min(bb.max, Math.max(bb.min, v))
        // Collapsible panels snap shut once dragged past half their minimum.
        const shut = (id: string, value: number, b0: { min: number; collapsed: number }) =>
          snap &&
          Boolean(configs.current.get(id)?.collapsible) &&
          value < (b0.min + b0.collapsed) / 2
        let valueA = nextA
        const collapseA = shut(a, valueA, ba)
        const collapseB = !collapseA && shut(b, total - valueA, bb)
        if (collapseA) valueA = ba.collapsed
        else if (collapseB) valueA = total - bb.collapsed
        else valueA = clampA(total - clampB(total - clampA(valueA)))
        setCollapsedFor(a, collapseA)
        setCollapsedFor(b, collapseB)
        live.current.sizes = commit({ ...current, [a]: valueA, [b]: total - valueA })
      },
      resetPair(a, b) {
        const { sizes: current, groupPx: px } = live.current
        const total = (current[a] ?? 0) + (current[b] ?? 0)
        const da = toPercent(configs.current.get(a)?.defaultSize, px, total / 2)
        setCollapsedFor(a, false)
        setCollapsedFor(b, false)
        commit({ ...current, [a]: da, [b]: total - da })
      },
      toggleCollapse(id, partner) {
        const { sizes: current, collapsed: isCollapsed, order: ids, groupPx: px } = live.current
        const config = configs.current.get(id)
        if (!config?.collapsible) return
        const other = partner ?? ids[ids.indexOf(id) + 1] ?? ids[ids.indexOf(id) - 1]
        if (!other) return
        const b = bounds(id)
        const willCollapse = !isCollapsed[id]
        const total = (current[id] ?? 0) + (current[other] ?? 0)
        const target = willCollapse
          ? b.collapsed
          : Math.max(b.min, toPercent(config.defaultSize, px, b.min))
        setCollapsedFor(id, willCollapse)
        commit({ ...current, [id]: target, [other]: total - target })
      },
      resize(id, size) {
        const { sizes: current, order: ids } = live.current
        const other = ids[ids.indexOf(id) + 1] ?? ids[ids.indexOf(id) - 1]
        if (!other) return
        const total = (current[id] ?? 0) + (current[other] ?? 0)
        const value = Math.min(total, Math.max(0, size))
        commit({ ...current, [id]: value, [other]: total - value })
      },
      setDragging,
    }),
    [bounds, commit, setCollapsedFor],
  )

  const value = React.useMemo<GroupContextValue>(
    () => ({ direction, register, update, sizes, collapsed, dragging, version, api }),
    [direction, register, update, sizes, collapsed, dragging, version, api],
  )

  return (
    <GroupContext.Provider value={value}>
      <div
        ref={(node) => {
          groupRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        data-slot="resizable-group"
        data-direction={direction}
        className={cn(
          "flex size-full min-h-0 min-w-0 overflow-hidden",
          direction === "vertical" ? "flex-col" : "flex-row",
          className,
        )}
        style={style}
        {...props}
      >
        {children}
      </div>
    </GroupContext.Provider>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ResizablePanel
 * -----------------------------------------------------------------------------------------------*/

interface ResizablePanelProps
  extends Omit<React.ComponentProps<"div">, "id">,
    Omit<PanelConfig, "id"> {
  /** Stable id, used for persistence and `aria-controls`. Generated when omitted. */
  id?: string
  /** Imperative handle: collapse, expand, resize. */
  panelRef?: React.Ref<ResizablePanelHandle>
}

function ResizablePanel({
  id: idProp,
  defaultSize,
  minSize,
  maxSize,
  collapsible,
  collapsedSize,
  onCollapsedChange,
  panelRef,
  className,
  style,
  children,
  ...props
}: ResizablePanelProps) {
  const generated = React.useId()
  const id = idProp ?? generated
  const { register, update, sizes, collapsed, api } = useGroup("ResizablePanel")
  const config: PanelConfig = {
    id,
    defaultSize,
    minSize,
    maxSize,
    collapsible,
    collapsedSize,
    onCollapsedChange,
  }
  const configRef = React.useRef(config)
  configRef.current = config

  React.useLayoutEffect(() => register(configRef.current), [id, register])
  React.useLayoutEffect(() => update(configRef.current))

  React.useImperativeHandle(
    panelRef,
    () => ({
      collapse: () => {
        if (!collapsed[id]) api.toggleCollapse(id)
      },
      expand: () => {
        if (collapsed[id]) api.toggleCollapse(id)
      },
      resize: (size) => {
        const group = api.getGroup()
        const px = group
          ? group.dataset.direction === "vertical"
            ? group.clientHeight
            : group.clientWidth
          : 0
        api.resize(id, toPercent(size, px, 0))
      },
      isCollapsed: () => Boolean(collapsed[id]),
      getSize: () => api.getSizes()[id] ?? 0,
    }),
    [api, collapsed, id],
  )

  const size = sizes[id]
  const fallback = typeof defaultSize === "number" ? defaultSize : 1
  const isCollapsed = Boolean(collapsed[id])

  return (
    <div
      id={id}
      data-slot="resizable-panel"
      data-panel-id={id}
      data-collapsed={isCollapsed ? "" : undefined}
      className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}
      style={{ flex: `${size ?? fallback} 1 0px`, ...style }}
      {...props}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ResizableHandle
 * -----------------------------------------------------------------------------------------------*/

interface ResizableHandleProps extends React.ComponentProps<"div"> {
  /** Shows a small grip in the middle of the hairline. */
  withGrip?: boolean
  /** Percentage moved per arrow key press. Shift moves ten times as far. */
  keyboardStep?: number
  disabled?: boolean
}

function neighborIds(handle: HTMLElement | null): [string | undefined, string | undefined] {
  if (!handle) return [undefined, undefined]
  const find = (dir: "previousElementSibling" | "nextElementSibling") => {
    let node = handle[dir]
    while (node && (node as HTMLElement).dataset?.slot !== "resizable-panel") node = node[dir]
    return (node as HTMLElement | null)?.dataset.panelId
  }
  return [find("previousElementSibling"), find("nextElementSibling")]
}

function ResizableHandle({
  withGrip = false,
  keyboardStep = 2,
  disabled = false,
  className,
  onPointerDown,
  onKeyDown,
  onDoubleClick,
  "aria-label": ariaLabel = "Resize panels",
  ...props
}: ResizableHandleProps) {
  const { direction, sizes, collapsed, dragging, version, api } = useGroup("ResizableHandle")
  const handleId = React.useId()
  const ref = React.useRef<HTMLDivElement>(null)
  const [pair, setPair] = React.useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ])
  const horizontal = direction === "horizontal"

  React.useLayoutEffect(() => {
    const next = neighborIds(ref.current)
    setPair((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next))
  }, [version])

  const [a, b] = pair
  const sizeA = a ? (sizes[a] ?? 0) : 0
  // The real range of this handle also depends on what the panel across it allows.
  const range = (() => {
    if (!a || !b) return { min: 0, max: 100 }
    const ba = api.bounds(a)
    const bb = api.bounds(b)
    const total = (sizes[a] ?? 0) + (sizes[b] ?? 0)
    return { min: Math.max(ba.min, total - bb.max), max: Math.min(ba.max, total - bb.min) }
  })()
  const isDragging = dragging === handleId

  const cursorFor = () => {
    if (!a || !b) return horizontal ? "col-resize" : "row-resize"
    const current = api.getSizes()
    const ba = api.bounds(a)
    const bb = api.bounds(b)
    const atMinA = (current[a] ?? 0) <= ba.min + EPS || collapsed[a]
    const atMaxA = (current[a] ?? 0) >= ba.max - EPS || (current[b] ?? 0) <= bb.min + EPS
    const rtl = horizontal && getComputedStyle(ref.current as Element).direction === "rtl"
    if (atMinA && atMaxA) return "not-allowed"
    if (atMinA) return horizontal ? (rtl ? "w-resize" : "e-resize") : "s-resize"
    if (atMaxA) return horizontal ? (rtl ? "e-resize" : "w-resize") : "n-resize"
    return horizontal ? "col-resize" : "row-resize"
  }

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event)
    if (event.defaultPrevented || disabled || !a || !b || event.button !== 0) return
    const group = api.getGroup()
    if (!group) return
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    target.focus({ preventScroll: true })
    const rect = group.getBoundingClientRect()
    const total = horizontal ? rect.width : rect.height
    const rtl = horizontal && getComputedStyle(group).direction === "rtl"
    const start = horizontal ? event.clientX : event.clientY
    const startA = api.getSizes()[a] ?? 0
    api.setDragging(handleId)
    setGlobalCursor(cursorFor())

    const move = (e: PointerEvent) => {
      const pos = horizontal ? e.clientX : e.clientY
      const deltaPx = (pos - start) * (rtl ? -1 : 1)
      api.setPair(a, b, startA + (deltaPx / total) * 100)
      setGlobalCursor(cursorFor())
    }
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
      api.setDragging(null)
      setGlobalCursor(null)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled || !a || !b) return
    const rtl = horizontal && getComputedStyle(event.currentTarget).direction === "rtl"
    const step = keyboardStep * (event.shiftKey ? 5 : 1)
    const current = api.getSizes()[a] ?? 0
    const ba = api.bounds(a)
    let next: number | null = null
    const grow = horizontal ? (rtl ? "ArrowLeft" : "ArrowRight") : "ArrowDown"
    const shrink = horizontal ? (rtl ? "ArrowRight" : "ArrowLeft") : "ArrowUp"
    if (event.key === grow) next = current + step
    else if (event.key === shrink) next = current - step
    else if (event.key === "Home") next = ba.min
    else if (event.key === "End") next = ba.max
    else if (event.key === "Enter") {
      event.preventDefault()
      const target = api.getConfig(a)?.collapsible ? a : api.getConfig(b)?.collapsible ? b : null
      if (target) api.toggleCollapse(target, target === a ? b : a)
      return
    }
    if (next === null) return
    event.preventDefault()
    // Keyboard moves never snap a panel shut: only Enter collapses.
    api.setPair(a, b, Math.max(next, ba.min), false)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the APG window splitter pattern
    <div
      ref={ref}
      role="separator"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-controls={a}
      aria-valuenow={Math.round(sizeA)}
      aria-valuemin={Math.round(range.min)}
      aria-valuemax={Math.round(range.max)}
      aria-disabled={disabled || undefined}
      data-slot="resizable-handle"
      data-resize-handle-state={isDragging ? "drag" : "idle"}
      data-direction={direction}
      onPointerDown={startDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)
        if (!event.defaultPrevented && !disabled && a && b) api.resetPair(a, b)
      }}
      className={cn(
        "group/handle bg-chatcn-border relative z-10 flex shrink-0 touch-none items-center justify-center outline-none select-none",
        horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
        disabled && "pointer-events-none",
        // The hit area is wider than the hairline: 9 px with a mouse, 24 px with a finger.
        "before:absolute before:content-['']",
        horizontal
          ? "before:inset-y-0 before:-right-1 before:-left-1 pointer-coarse:before:-right-3 pointer-coarse:before:-left-3"
          : "before:inset-x-0 before:-top-1 before:-bottom-1 pointer-coarse:before:-top-3 pointer-coarse:before:-bottom-3",
        className,
      )}
      {...props}
    >
      {/* The hairline thickens to 3 px on hover (after a short intent delay), drag and focus. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute opacity-0",
          "ease-chatcn-out transition-[opacity,scale,background-color] duration-150",
          horizontal
            ? "inset-y-0 left-1/2 w-[3px] -translate-x-1/2 scale-x-[0.34]"
            : "inset-x-0 top-1/2 h-[3px] -translate-y-1/2 scale-y-[0.34]",
          "bg-chatcn-border-strong",
          "[@media(hover:hover)]:group-hover/handle:opacity-100 [@media(hover:hover)]:group-hover/handle:delay-100",
          horizontal
            ? "[@media(hover:hover)]:group-hover/handle:scale-x-100"
            : "[@media(hover:hover)]:group-hover/handle:scale-y-100",
          "group-focus-visible/handle:bg-chatcn-accent group-focus-visible/handle:opacity-100 group-focus-visible/handle:delay-0",
          horizontal
            ? "group-focus-visible/handle:scale-x-100"
            : "group-focus-visible/handle:scale-y-100",
          "group-data-[resize-handle-state=drag]/handle:bg-chatcn-fg group-data-[resize-handle-state=drag]/handle:opacity-100 group-data-[resize-handle-state=drag]/handle:delay-0",
          horizontal
            ? "group-data-[resize-handle-state=drag]/handle:scale-x-100"
            : "group-data-[resize-handle-state=drag]/handle:scale-y-100",
          "motion-reduce:transition-opacity",
        )}
      />
      {withGrip ? (
        <span
          aria-hidden="true"
          className={cn(
            "bg-chatcn-card shadow-chatcn-xs relative rounded-full",
            "group-data-[resize-handle-state=drag]/handle:bg-chatcn-fg transition-colors duration-150",
            horizontal ? "h-6 w-1.5" : "h-1.5 w-6",
          )}
        />
      ) : null}
    </div>
  )
}

export type {
  ResizableGroupProps,
  ResizableHandleProps,
  ResizablePanelHandle,
  ResizablePanelProps,
  ResizableSize,
}
export { ResizableGroup, ResizableHandle, ResizablePanel }
