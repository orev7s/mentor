"use client"

import * as React from "react"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { type DiffLine, type DiffSegment, splitRows } from "@/lib/chatcn-diff"
import { cn } from "@/lib/utils"
import { TONES, type DiffTone, type DiffView } from "./shared"

/* -------------------------------------------------------------------------------------------------
 * Small parts
 * -----------------------------------------------------------------------------------------------*/

function Segments({ segments, word }: { segments: DiffSegment[]; word: string }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.changed ? (
          <span key={i} className={cn("rounded-[2px] [box-decoration-break:clone]", word)}>
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={i}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  )
}

function srLabel(line: DiffLine) {
  if (line.kind === "add") return `Added line ${line.newNumber}: `
  if (line.kind === "remove") return `Removed line ${line.oldNumber}: `
  return ""
}

function LineText({ line, tone, caret }: { line: DiffLine; tone: DiffTone; caret?: boolean }) {
  const t = TONES[tone]
  const word = line.kind === "add" ? t.addWord : t.removeWord
  return (
    <>
      {line.kind !== "context" ? <span className="sr-only">{srLabel(line)}</span> : null}
      {line.segments ? <Segments segments={line.segments} word={word} /> : line.text}
      {caret ? <StreamingCaret /> : null}
    </>
  )
}

function rowTone(kind: DiffLine["kind"], tone: DiffTone) {
  if (kind === "context") return "text-chatcn-fg-muted"
  return cn(
    "before:absolute before:inset-y-0 before:start-0 before:w-px",
    kind === "add" ? TONES[tone].add : TONES[tone].remove,
  )
}

function gutterTone(kind: DiffLine["kind"], tone: DiffTone) {
  if (kind === "context") return undefined
  return kind === "add" ? TONES[tone].addGutter : TONES[tone].removeGutter
}

function Glyph({ kind, tone }: { kind: DiffLine["kind"]; tone: DiffTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "w-5 shrink-0 text-center select-none",
        kind === "add" && cn("font-medium", TONES[tone].addGlyph),
        kind === "remove" && TONES[tone].removeGlyph,
      )}
    >
      {kind === "add" ? "+" : kind === "remove" ? "-" : ""}
    </span>
  )
}

function Num({
  value,
  strong,
  gutter,
}: {
  value?: number
  strong?: boolean
  /** A changed row's number cell takes a deeper step of the row tint, so changes scan down the edge. */
  gutter?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "chatcn-text-12 w-(--diff-num) shrink-0 pe-2 text-end leading-5 tabular-nums select-none",
        strong ? "text-chatcn-fg-muted" : "text-chatcn-fg-subtle",
        gutter,
      )}
    >
      {value ?? ""}
    </span>
  )
}

/** Which line number columns a unified row shows. A new or deleted file only has one side. */
type NumberColumns = "both" | "old" | "new"

const UnifiedRow = React.memo(function UnifiedRow({
  line,
  tone,
  wrap,
  caret,
  numbers = "both",
}: {
  line: DiffLine
  tone: DiffTone
  wrap: boolean
  caret?: boolean
  numbers?: NumberColumns
}) {
  const changed = line.kind !== "context"
  const gutter = gutterTone(line.kind, tone)
  return (
    <div
      data-slot="diff-line"
      data-diff-line={line.kind}
      className={cn("relative flex min-h-5", rowTone(line.kind, tone))}
    >
      {numbers !== "new" ? <Num value={line.oldNumber} strong={changed} gutter={gutter} /> : null}
      {numbers !== "old" ? <Num value={line.newNumber} strong={changed} gutter={gutter} /> : null}
      <Glyph kind={line.kind} tone={tone} />
      <code
        className={cn(
          "min-w-0 flex-1 pe-4 font-[inherit]",
          wrap ? "[overflow-wrap:anywhere] whitespace-pre-wrap" : "whitespace-pre",
        )}
      >
        <LineText line={line} tone={tone} caret={caret} />
      </code>
    </div>
  )
})

function SplitCell({
  line,
  side,
  tone,
  caret,
}: {
  line?: DiffLine
  side: "old" | "new"
  tone: DiffTone
  caret?: boolean
}) {
  if (!line) {
    return <div aria-hidden="true" className="bg-chatcn-alpha-100 min-h-5" />
  }
  const changed = line.kind !== "context"
  return (
    <div
      data-slot="diff-line"
      data-diff-line={line.kind}
      className={cn("relative flex min-h-5 min-w-0", rowTone(line.kind, tone))}
    >
      <Num
        value={side === "old" ? line.oldNumber : line.newNumber}
        strong={changed}
        gutter={gutterTone(line.kind, tone)}
      />
      <Glyph kind={line.kind} tone={tone} />
      <code className="min-w-0 flex-1 pe-3 font-[inherit] [overflow-wrap:anywhere] whitespace-pre-wrap">
        <LineText line={line} tone={tone} caret={caret} />
      </code>
    </div>
  )
}

/** True while the element scrolls sideways, so it only joins the tab order when it has to. */
function useScrollsX<T extends HTMLElement>(enabled: boolean) {
  const ref = React.useRef<T>(null)
  const [scrolls, setScrolls] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof ResizeObserver === "undefined") {
      setScrolls(false)
      return
    }
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [enabled])
  return [ref, scrolls] as const
}

function Lines({
  lines,
  view,
  tone,
  wrap,
  caret,
  numbers,
}: {
  lines: DiffLine[]
  view: DiffView
  tone: DiffTone
  wrap: boolean
  caret?: boolean
  numbers?: NumberColumns
}) {
  const last = lines[lines.length - 1]
  const [scrollRef, scrolls] = useScrollsX<HTMLDivElement>(view !== "split" && !wrap)
  if (view === "split") {
    const rows = splitRows(lines)
    return (
      // One divider for the whole hunk, so it runs through the top and bottom padding too.
      <div className="before:bg-chatcn-border relative py-1 before:absolute before:inset-y-0 before:start-1/2 before:w-px">
        {rows.map((row, i) => {
          const tail = caret && (row.left === last || row.right === last)
          return (
            <div
              key={`${row.left?.oldNumber ?? ""}-${row.right?.newNumber ?? ""}-${i}`}
              className="grid grid-cols-2"
            >
              <SplitCell
                line={row.left}
                side="old"
                tone={tone}
                caret={tail && row.left === last && !row.right}
              />
              <SplitCell
                line={row.right}
                side="new"
                tone={tone}
                caret={tail && row.right === last}
              />
            </div>
          )
        })}
      </div>
    )
  }
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the label only applies while role="group" is set
    <div
      ref={scrollRef}
      // A hunk wider than the viewer scrolls sideways, so the keyboard has to be able to reach it.
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? "group" : undefined}
      aria-label={scrolls ? "Changed lines, scrolls sideways" : undefined}
      className={cn(
        "py-1",
        !wrap && "chatcn-scroll overflow-x-auto",
        "focus-visible:outline-chatcn-accent outline-none focus-visible:outline-2 focus-visible:-outline-offset-2",
      )}
    >
      <div className={cn(!wrap && "w-max min-w-full")}>
        {lines.map((line) => (
          <UnifiedRow
            key={`${line.kind}-${line.oldNumber ?? ""}-${line.newNumber ?? ""}`}
            line={line}
            tone={tone}
            wrap={wrap}
            caret={caret && line === last}
            numbers={numbers}
          />
        ))}
      </div>
    </div>
  )
}

export type { NumberColumns }
export { Lines }
