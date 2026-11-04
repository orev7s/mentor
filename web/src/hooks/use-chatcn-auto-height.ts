"use client"

import * as React from "react"

/**
 * Smooth height for content that grows while it streams.
 *
 * Measures the inner element with a ResizeObserver and returns its height for an outer wrapper,
 * which transitions `height` with CSS. Each streamed line then eases in instead of jumping the
 * layout below it. Height is the one layout property worth animating here: it is short, it is
 * bounded by a max height, and it stops changing when the stream ends.
 *
 * Returns a callback ref, so it works for content that mounts later (a panel that opens).
 *
 * ```tsx
 * const { innerRef, height } = useChatcnAutoHeight()
 * <div style={{ height }} className="overflow-hidden transition-[height] duration-200">
 *   <div ref={innerRef}>{text}</div>
 * </div>
 * ```
 */
export function useChatcnAutoHeight<T extends HTMLElement = HTMLDivElement>({
  enabled = true,
}: {
  enabled?: boolean
} = {}) {
  const [node, setNode] = React.useState<T | null>(null)
  const [height, setHeight] = React.useState<number>()

  React.useLayoutEffect(() => {
    if (!enabled || !node) {
      setHeight(undefined)
      return
    }
    setHeight(node.getBoundingClientRect().height)
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const box = entry.borderBoxSize?.[0]
      setHeight(box ? box.blockSize : entry.target.getBoundingClientRect().height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, node])

  return { innerRef: setNode as React.RefCallback<T>, height: enabled ? height : undefined }
}

/**
 * Keeps a scroll container pinned to the bottom while content streams in, and lets go the moment
 * the user scrolls up. Scrolling back to the bottom pins it again. Pass any value that changes
 * when content grows (the text, a line count) as `dep`. Returns a callback ref.
 */
export function useChatcnStickToBottom<T extends HTMLElement = HTMLDivElement>(
  dep: unknown,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [node, setNode] = React.useState<T | null>(null)
  const pinned = React.useRef(true)

  React.useEffect(() => {
    if (!node) return
    pinned.current = true
    const onScroll = () => {
      pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24
    }
    node.addEventListener("scroll", onScroll, { passive: true })
    return () => node.removeEventListener("scroll", onScroll)
  }, [node])

  React.useLayoutEffect(() => {
    if (!enabled || !node || !pinned.current) return
    node.scrollTop = node.scrollHeight
  }, [dep, enabled, node])

  return setNode as React.RefCallback<T>
}
