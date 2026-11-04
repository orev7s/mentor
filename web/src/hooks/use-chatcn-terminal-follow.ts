"use client"

import * as React from "react"

/**
 * Follow mode for a terminal or log view: an explicit on/off toggle on top of stick-to-bottom.
 *
 * - While following, the view pins to the newest line. Pinning is instant, the way a real
 *   terminal scrolls: output that glides behind the reader is harder to read, not easier.
 * - Any upward wheel, touch, key or scrollbar drag turns following off in the same event.
 * - Scrolling back to the bottom turns it on again. So does the toggle.
 * - A ResizeObserver keeps the pin when lines rewrap (wrap toggle, panel resize).
 */

export interface UseChatcnTerminalFollowOptions {
  /** Controlled follow state. */
  follow?: boolean
  /** Initial follow state when uncontrolled. Default true. */
  defaultFollow?: boolean
  onFollowChange?: (follow: boolean) => void
  /** Distance from the bottom, in px, that still counts as the bottom. Default 8. */
  threshold?: number
}

export interface ChatcnTerminalFollow {
  /** Attach to the scrolling element. */
  scrollRef: (element: HTMLElement | null) => void
  /** Attach to the element that holds the lines (its size is observed). */
  contentRef: (element: HTMLElement | null) => void
  follow: boolean
  setFollow: (follow: boolean) => void
  /** Pin to the bottom now. Does not change the follow state. */
  pin: () => void
}

const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"])

export function useChatcnTerminalFollow({
  follow: followProp,
  defaultFollow = true,
  onFollowChange,
  threshold = 8,
}: UseChatcnTerminalFollowOptions = {}): ChatcnTerminalFollow {
  const [followState, setFollowState] = React.useState(defaultFollow)
  const follow = followProp ?? followState
  const [scroller, setScroller] = React.useState<HTMLElement | null>(null)
  const [content, setContent] = React.useState<HTMLElement | null>(null)

  const live = React.useRef({ follow, written: -1, lastTop: 0, onFollowChange, threshold })
  live.current.follow = follow
  live.current.onFollowChange = onFollowChange
  live.current.threshold = threshold

  const setFollow = React.useCallback(
    (next: boolean) => {
      if (live.current.follow === next) return
      live.current.follow = next
      if (followProp === undefined) setFollowState(next)
      live.current.onFollowChange?.(next)
    },
    [followProp],
  )

  const pin = React.useCallback(() => {
    const el = scroller
    if (!el) return
    el.scrollTop = el.scrollHeight
    live.current.written = el.scrollTop
    live.current.lastTop = el.scrollTop
  }, [scroller])

  // Turning follow on jumps to the newest line.
  React.useLayoutEffect(() => {
    if (follow) pin()
  }, [follow, pin])

  React.useEffect(() => {
    const el = scroller
    if (!el) return
    const s = live.current

    const onScroll = () => {
      const top = el.scrollTop
      const ours = Math.abs(top - s.written) < 1.5
      const atBottom = el.scrollHeight - top - el.clientHeight <= s.threshold
      if (!ours) {
        if (top < s.lastTop - 0.5 && !atBottom) setFollow(false)
        else if (atBottom && top > s.lastTop) setFollow(true)
        s.written = -1
      }
      s.lastTop = top
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && el.scrollTop > 0) setFollow(false)
    }
    let touchY = 0
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? 0
      if (y - touchY > 4) setFollow(false)
      touchY = y
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target !== el) return
      if (UP_KEYS.has(event.key) || (event.key === " " && event.shiftKey)) setFollow(false)
    }
    const ro = new ResizeObserver(() => {
      if (s.follow) pin()
    })
    ro.observe(el)
    if (content) ro.observe(content)

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: true })
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("keydown", onKeyDown)
    return () => {
      ro.disconnect()
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("keydown", onKeyDown)
    }
  }, [scroller, content, pin, setFollow])

  return { scrollRef: setScroller, contentRef: setContent, follow, setFollow, pin }
}
