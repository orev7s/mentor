"use client"

import * as React from "react"

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

/** Pointer travel before a press on the handle turns into a drag, so a click still focuses it. */
const DRAG_THRESHOLD = 3
/** Siblings make room on the in-out curve: this is on-screen movement, not an enter. */
const SHIFT_TRANSITION = "transform 200ms var(--chatcn-ease-in-out)"
/** The dropped item settles into its slot on the default out curve. */
const SETTLE_TRANSITION = "transform 160ms var(--chatcn-ease-out)"

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  )
}

interface UseChatcnPlanReorderOptions {
  /** Keys of the rendered rows, in order. Rows that cannot move (an undo row) still belong here. */
  ids: readonly string[]
  /** Called with the old and new index when a row is dropped or moved with the keyboard. */
  onMove: (from: number, to: number) => void
  /** Ids that have no handle and never move, for example an undo row. Others flow around them. */
  fixed?: readonly string[]
  /** Readable name of a row, for the screen reader announcement. */
  label?: (id: string) => string
  /** Noun for announcements and handle labels. Default "item". */
  noun?: string
  disabled?: boolean
}

interface DragState {
  id: string
  index: number
  pointerId: number
  startY: number
  dy: number
  active: boolean
  target: number
  shift: number
  tops: number[]
  heights: number[]
  handle: HTMLElement
}

/**
 * Reorders a vertical list with a pointer drag on a handle and with the arrow keys.
 *
 * The dragged row follows the pointer 1:1 and its siblings slide out of the way with transforms
 * only, so nothing reflows mid-drag. On drop, `onMove` fires, React reorders the DOM, and the row
 * settles from where it was released into its new slot (FLIP). Keyboard moves are instant: the
 * design rules never animate what the keyboard triggers. Insertions and removals by the caller
 * slide the remaining rows into place.
 *
 * Spread `getItemProps(id)` on each row and `getHandleProps(id)` on its grip button. Render
 * `announcement` in a polite live region.
 */
function useChatcnPlanReorder({
  ids,
  onMove,
  fixed,
  label = (id) => id,
  noun = "item",
  disabled = false,
}: UseChatcnPlanReorderOptions) {
  const items = React.useRef(new Map<string, HTMLElement>())
  const refCallbacks = React.useRef(new Map<string, (el: HTMLElement | null) => void>())
  const prevTops = React.useRef(new Map<string, number>())
  const drag = React.useRef<DragState | null>(null)
  const skipFlip = React.useRef(false)
  const settling = React.useRef(new WeakSet<HTMLElement>())
  const focusAfterMove = React.useRef<string | null>(null)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState("")

  const latest = React.useRef({ ids, onMove, label, noun, fixed, disabled })
  latest.current = { ids, onMove, label, noun, fixed, disabled }

  // FLIP: anything whose slot moved since the last commit slides from its old place to the new.
  const key = ids.join("\u0000")
  useIsoLayoutEffect(() => {
    const animate = !skipFlip.current && !reducedMotion()
    skipFlip.current = false
    const next = new Map<string, number>()
    for (const id of ids) {
      const el = items.current.get(id)
      if (!el) continue
      const top = el.offsetTop
      next.set(id, top)
      const before = prevTops.current.get(id)
      if (!animate || before === undefined) continue
      const delta = before - top
      if (Math.abs(delta) < 0.5) continue
      el.style.transition = "none"
      el.style.transform = `translateY(${delta}px)`
      // Read layout so the browser commits the inverted position before we release it.
      void el.offsetHeight
      el.style.transition = SETTLE_TRANSITION
      el.style.transform = ""
      settling.current.add(el)
      const clear = () => {
        settling.current.delete(el)
        el.style.transition = ""
        el.removeEventListener("transitionend", clear)
      }
      el.addEventListener("transitionend", clear)
    }
    prevTops.current = next

    const focusId = focusAfterMove.current
    focusAfterMove.current = null
    if (focusId) {
      const handle = items.current.get(focusId)?.querySelector<HTMLElement>("[data-reorder-handle]")
      if (handle && document.activeElement !== handle) handle.focus()
    }
  }, [key])

  const getItemProps = React.useCallback((id: string) => {
    let ref = refCallbacks.current.get(id)
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) items.current.set(id, el)
        else items.current.delete(id)
      }
      refCallbacks.current.set(id, ref)
    }
    return { ref, "data-reorder-item": id }
  }, [])

  const announce = (id: string, to: number) => {
    const { ids, label, noun } = latest.current
    setAnnouncement(`Moved ${noun} ${label(id)} to position ${to + 1} of ${ids.length}.`)
  }

  /** Moves with the keyboard: no animation, focus stays on the handle. */
  const moveBy = (id: string, to: number) => {
    const { ids, onMove, fixed } = latest.current
    const from = ids.indexOf(id)
    const clamped = Math.max(0, Math.min(ids.length - 1, to))
    if (from === -1 || clamped === from) return
    if (fixed?.includes(ids[clamped] ?? "")) {
      // Step over a fixed row instead of swapping with it.
      const beyond = clamped + Math.sign(clamped - from)
      if (beyond < 0 || beyond >= ids.length) return
      return moveBy(id, beyond)
    }
    skipFlip.current = true
    focusAfterMove.current = id
    onMove(from, clamped)
    announce(id, clamped)
  }

  const resetStyles = (except?: string) => {
    for (const [id, el] of items.current) {
      if (id === except) continue
      el.style.transition = "none"
      el.style.transform = ""
      // Hand transitions back to the stylesheet once the jump has painted.
      requestAnimationFrame(() => {
        if (!el.style.transform && !settling.current.has(el)) el.style.transition = ""
      })
    }
  }

  const endDrag = (commit: boolean) => {
    const state = drag.current
    drag.current = null
    if (!state) return
    if (state.handle.hasPointerCapture?.(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId)
    }
    if (!state.active) return
    setDraggingId(null)
    const { ids, onMove } = latest.current
    const dragged = items.current.get(state.id)
    const target = commit ? state.target : state.index

    if (target === state.index) {
      // Back to where it started.
      resetStyles(state.id)
      if (dragged) {
        dragged.style.transition = reducedMotion() ? "none" : SETTLE_TRANSITION
        dragged.style.transform = ""
      }
      return
    }

    // Remember where everything is on screen right now, so the layout effect can settle the
    // dropped row from the release point. Siblings already sit where their new slots are.
    const tops = new Map<string, number>()
    ids.forEach((id, i) => {
      const el = items.current.get(id)
      if (!el) return
      let offset = 0
      if (id === state.id) offset = state.dy
      else if (i > state.index && i <= target) offset = -state.shift
      else if (i < state.index && i >= target) offset = state.shift
      tops.set(id, el.offsetTop + offset)
    })
    prevTops.current = tops
    resetStyles()
    onMove(state.index, target)
    announce(state.id, target)
  }

  const getHandleProps = (id: string) => {
    const name = label(id)
    return {
      "data-reorder-handle": "",
      "aria-label": `Reorder ${noun} ${name}`,
      "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (latest.current.disabled) return
        const index = latest.current.ids.indexOf(id)
        let to: number | undefined
        if (event.key === "ArrowUp") to = index - 1
        else if (event.key === "ArrowDown") to = index + 1
        else if (event.key === "Home") to = 0
        else if (event.key === "End") to = latest.current.ids.length - 1
        if (to === undefined) return
        event.preventDefault()
        moveBy(id, to)
      },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (latest.current.disabled || event.button !== 0 || drag.current) return
        const { ids } = latest.current
        const index = ids.indexOf(id)
        if (index === -1) return
        const els = ids.map((key) => items.current.get(key))
        if (els.some((el) => !el)) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const tops = els.map((el) => (el as HTMLElement).offsetTop)
        const heights = els.map((el) => (el as HTMLElement).offsetHeight)
        // The room a moved row needs: its height plus the gap the list puts between rows.
        const gap =
          ids.length > 1 ? Math.max(0, (tops[1] ?? 0) - (tops[0] ?? 0) - (heights[0] ?? 0)) : 0
        drag.current = {
          id,
          index,
          pointerId: event.pointerId,
          startY: event.clientY,
          dy: 0,
          active: false,
          target: index,
          shift: (heights[index] ?? 0) + gap,
          tops,
          heights,
          handle: event.currentTarget,
        }
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        const state = drag.current
        if (!state || state.pointerId !== event.pointerId) return
        const raw = event.clientY - state.startY
        if (!state.active) {
          if (Math.abs(raw) < DRAG_THRESHOLD) return
          state.active = true
          setDraggingId(state.id)
        }
        const { ids, fixed } = latest.current
        const last = ids.length - 1
        const top = state.tops[state.index] ?? 0
        const height = state.heights[state.index] ?? 0
        const min = (state.tops[0] ?? 0) - top
        const max = (state.tops[last] ?? 0) + (state.heights[last] ?? 0) - (top + height)
        const dy = Math.max(min, Math.min(max, raw))
        state.dy = dy

        const center = top + height / 2 + dy
        let target = state.index
        for (let i = state.index + 1; i <= last; i++) {
          if (center > (state.tops[i] ?? 0) + (state.heights[i] ?? 0) / 2) target = i
        }
        for (let i = state.index - 1; i >= 0; i--) {
          if (center < (state.tops[i] ?? 0) + (state.heights[i] ?? 0) / 2) target = i
        }
        // A fixed row never moves, so the dragged one cannot land on it.
        while (target !== state.index && fixed?.includes(ids[target] ?? "")) {
          target += target > state.index ? -1 : 1
        }
        state.target = target

        const motion = reducedMotion() ? "none" : SHIFT_TRANSITION
        ids.forEach((key, i) => {
          const el = items.current.get(key)
          if (!el) return
          if (key === state.id) {
            el.style.transition = "none"
            el.style.transform = `translateY(${dy}px)`
            return
          }
          let offset = 0
          if (i > state.index && i <= target) offset = -state.shift
          else if (i < state.index && i >= target) offset = state.shift
          el.style.transition = motion
          el.style.transform = offset ? `translateY(${offset}px)` : ""
        })
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        if (drag.current?.pointerId === event.pointerId) endDrag(true)
      },
      onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
        if (drag.current?.pointerId === event.pointerId) endDrag(false)
      },
      onLostPointerCapture: (event: React.PointerEvent<HTMLElement>) => {
        if (drag.current?.pointerId === event.pointerId) endDrag(true)
      },
      // Escape during a drag puts the row back.
      onKeyUp: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape" && drag.current) endDrag(false)
      },
    }
  }

  return { getItemProps, getHandleProps, draggingId, announcement, moveBy }
}

/** Returns a copy of `list` with the item at `from` moved to `to`. */
function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

export type { UseChatcnPlanReorderOptions }
export { moveItem, useChatcnPlanReorder }
