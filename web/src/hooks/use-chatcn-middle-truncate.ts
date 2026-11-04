import * as React from "react"

const ELLIPSIS = "…"
const SEPARATORS = /[\s\-_.]+$/

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

/**
 * Splits a file name into its stem and extension (with the dot). Dotfiles, and names whose last
 * "extension" is really a sentence (`notes v2. final`), keep everything in the stem.
 */
export function splitChatcnFileName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || name.length - dot > 10 || /\s/.test(name.slice(dot))) {
    return { stem: name, ext: "" }
  }
  return { stem: name.slice(0, dot), ext: name.slice(dot) }
}

/**
 * The end of the stem worth keeping beside the extension: the last word when it is short
 * (`2026` in `quarterly-report-2026.pdf`), else the last four characters.
 */
function stemTail(stem: string) {
  const word = /[\s\-_.]([^\s\-_.]{2,8})$/.exec(stem)?.[1]
  const tail = word ?? stem.slice(-4).replace(/^[\s\-_.]+/, "")
  return stem.length - tail.length >= 4 ? tail : ""
}

/**
 * Truncates `text` in the middle so it fits `maxWidth`, as one string, so the ellipsis sits flush
 * against both halves: `quarterly-rep…2026.pdf`. The extension is never cut. `measure` returns
 * the rendered width of a string. Exported for tests and for canvas or SVG labels.
 */
export function middleTruncateChatcn(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string {
  if (maxWidth <= 0 || measure(text) <= maxWidth) return text
  const { stem, ext } = splitChatcnFileName(text)
  const keep = stemTail(stem)
  // Prefer a tail that tells similar files apart; drop to the bare extension when room is short.
  const tails = keep ? [keep + ext, ext] : [ext]
  for (const [index, tail] of tails.entries()) {
    const headMax = text.length - tail.length
    const minHead = index < tails.length - 1 ? Math.min(6, headMax) : 1
    const join = (n: number) => {
      const head = text.slice(0, n)
      return (head.replace(SEPARATORS, "") || head) + ELLIPSIS + tail
    }
    let lo = 0
    let hi = headMax
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (measure(join(mid)) <= maxWidth) lo = mid
      else hi = mid - 1
    }
    if (lo >= minHead) return join(lo)
  }
  return ELLIPSIS + ext
}

let context: CanvasRenderingContext2D | null | undefined

/** A text measurer that matches an element's font, from one shared canvas. */
function measurerFor(element: HTMLElement) {
  if (context === undefined) context = document.createElement("canvas").getContext("2d")
  const ctx = context
  if (!ctx) return null
  const style = getComputedStyle(element)
  const spacing = Number.parseFloat(style.letterSpacing) || 0
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return {
    spacing,
    measure: (value: string) => {
      ctx.font = font
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`
      return ctx.measureText(value).width
    },
  }
}

/**
 * Middle truncation that reflows with its container. Render it like this, so the name keeps its
 * full width as the element's natural size (chips still hug long names) and screen readers hear
 * the whole name, while the eye sees the shortened one:
 *
 * ```tsx
 * const name = useChatcnMiddleTruncate(file.name)
 * <span ref={name.ref} title={name.title} className="block min-w-0 overflow-hidden whitespace-nowrap">
 *   <span ref={name.textRef} style={name.textStyle} aria-hidden="true" dir="auto">{name.text}</span>
 *   <span dir="auto" className="block h-0 overflow-hidden">{file.name}</span>
 * </span>
 * ```
 *
 * Measures with a canvas once per width change (a ResizeObserver feeds the width, so there is
 * no layout read in the loop), then checks the rendered line once and corrects a sub-pixel
 * overshoot. The part of a glyph that no longer fits is spread as tracking too small to see
 * (at most 0.4 px a glyph), so a shortened name ends exactly at its box and whatever sits beside
 * it keeps the same gap as beside a full name. Pass `textStyle` to the visible span for that.
 * Works in either direction: the text keeps its own direction through `dir="auto"`.
 */
export function useChatcnMiddleTruncate(value: string) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const textRef = React.useRef<HTMLSpanElement>(null)
  const [fit, setFit] = React.useState<{ source: string; text: string; tracking?: string }>({
    source: value,
    text: value,
  })
  const width = React.useRef(-1)
  const corrections = React.useRef(0)

  const run = React.useCallback(
    (available: number) => {
      const element = ref.current
      if (!element || available <= 0) return
      width.current = available
      const measurer = measurerFor(element)
      if (!measurer) return
      const text = middleTruncateChatcn(value, available, measurer.measure)
      let tracking: string | undefined
      if (text !== value) {
        const slack = available - measurer.measure(text) - 0.5
        const extra = Math.min(Math.max(slack / Array.from(text).length, 0), 0.4)
        if (extra > 0.01) tracking = `${(measurer.spacing + extra).toFixed(3)}px`
      }
      setFit((current) =>
        current.source === value && current.text === text && current.tracking === tracking
          ? current
          : { source: value, text, tracking },
      )
    },
    [value],
  )

  useIsoLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    corrections.current = 0
    run(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0
      if (Math.abs(next - width.current) < 0.5) return
      corrections.current = 0
      run(next)
    })
    observer.observe(element)
    // Webfonts change every width: measure again once they are in.
    let live = true
    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(() => {
        if (live && ref.current) run(ref.current.getBoundingClientRect().width)
      })
    }
    return () => {
      live = false
      observer.disconnect()
    }
  }, [run])

  // Canvas and layout can disagree by a fraction of a pixel (kerning, tabular figures): one check
  // per fit, and at most two corrections, so it never loops.
  useIsoLayoutEffect(() => {
    const element = ref.current
    const line = textRef.current
    if (!element || !line || fit.text === value || corrections.current >= 2) return
    const over = line.getBoundingClientRect().width - element.getBoundingClientRect().width
    if (over > 0.25) {
      corrections.current += 1
      const real = width.current
      run(real - over - 0.5)
      width.current = real
    }
  }, [fit, value, run])

  const fresh = fit.source === value
  const text = fresh ? fit.text : value
  const truncated = text !== value
  const textStyle: React.CSSProperties | undefined =
    fresh && fit.tracking ? { letterSpacing: fit.tracking } : undefined
  return { ref, textRef, text, textStyle, truncated, title: truncated ? value : undefined }
}
