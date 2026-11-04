"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { Kbd } from "@/components/ui/chatcn/kbd"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { Tooltip } from "@/components/ui/chatcn/tooltip"
import {
  type DiffFile,
  type DiffGap,
  type DiffHunk,
  type DiffLine,
  type DiffSegment,
  diffGaps,
  diffText,
  gapLines,
  type HunkDecision,
  parsePatch,
  splitName,
  splitPath,
  splitRows,
} from "@/lib/chatcn-diff"
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Columns2Icon,
  Rows2Icon,
  Undo2Icon,
  XIcon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type DiffView = "unified" | "split"
type DiffTone = "mono" | "color"

interface DiffViewerProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** A parsed file from `diffText` or `parsePatch`. Wins over the other inputs. */
  file?: DiffFile
  /** Unified diff text, as git and most agents return it. The first file is shown. */
  patch?: string
  /** Two versions of the file. Diffed in the browser, so unchanged lines can expand. */
  oldText?: string
  newText?: string
  path?: string
  oldPath?: string
  view?: DiffView
  defaultView?: DiffView
  onViewChange?: (view: DiffView) => void
  /** Show the unified and split toggle in the header. Defaults to true. */
  viewToggle?: boolean
  /** `color` (default) is red and green on top of the glyphs. `mono` uses glyphs, weight and gray fills only. */
  tone?: DiffTone
  /** Unchanged lines around each change, for `oldText`/`newText`. Defaults to 3. */
  context?: number
  /** Word-level highlights on changed lines. Defaults to true. */
  words?: boolean
  /** The patch is still arriving. Hunks render as they land; earlier ones never move. */
  streaming?: boolean
  /** Per-hunk review. Shown when any of these are set, or with `review`. */
  review?: boolean
  decisions?: Record<string, HunkDecision>
  defaultDecisions?: Record<string, HunkDecision>
  onDecisionChange?: (hunkId: string, decision: HunkDecision | undefined) => void
  /** Header Accept all and Reject all. Defaults to calling `onDecisionChange` per hunk. */
  onDecideAll?: (decision: HunkDecision | undefined) => void
  /** Show Accept all and Reject all in the header when reviewing. Defaults to true. */
  bulkActions?: boolean
  /** Above this many lines the diff waits behind "Show anyway". Defaults to 1000. */
  maxLines?: number
  /** Wrap long lines in the unified view. The split view always wraps. */
  wrap?: boolean
  /** Show the file header. Turn off when the path is already shown elsewhere. */
  header?: boolean
  /** Extra controls at the end of the header. */
  actions?: React.ReactNode
  /** `card` draws its own surface. `plain` sits inside a surface you already have. */
  variant?: "card" | "plain"
}

/* -------------------------------------------------------------------------------------------------
 * Tone
 * Red and green by default, from the `--chatcn-diff-*` tokens: a tinted row, a 1 px rule and a
 * stronger word highlight. The +/- glyphs and the screen reader labels carry the meaning on their
 * own, so `mono` (grays and weight only) reads the same for people who cannot tell the hues apart.
 * -----------------------------------------------------------------------------------------------*/

const TONES = {
  mono: {
    add: "bg-chatcn-alpha-200 text-chatcn-fg before:bg-chatcn-fg",
    remove: "bg-chatcn-alpha-100 text-chatcn-fg-subtle before:bg-chatcn-border-strong",
    addWord: "bg-chatcn-alpha-500 text-chatcn-fg",
    removeWord: "bg-chatcn-alpha-400 text-chatcn-fg-muted",
    addGlyph: "text-chatcn-fg",
    removeGlyph: "text-chatcn-fg-subtle",
    plus: "text-chatcn-fg",
    minus: "text-chatcn-fg-subtle",
    addGutter: "bg-chatcn-alpha-200",
    removeGutter: "bg-chatcn-alpha-100",
  },
  color: {
    add: "bg-chatcn-diff-add-bg text-chatcn-fg before:bg-chatcn-diff-add-fg",
    remove: "bg-chatcn-diff-del-bg text-chatcn-fg before:bg-chatcn-diff-del-fg",
    addWord: "bg-chatcn-diff-add-word-bg text-chatcn-fg",
    removeWord: "bg-chatcn-diff-del-word-bg text-chatcn-fg",
    addGlyph: "text-chatcn-diff-add-fg",
    removeGlyph: "text-chatcn-diff-del-fg",
    plus: "text-chatcn-diff-add-fg",
    minus: "text-chatcn-diff-del-fg",
    addGutter: "bg-chatcn-diff-add-gutter",
    removeGutter: "bg-chatcn-diff-del-gutter",
  },
} as const

/* -------------------------------------------------------------------------------------------------
 * Small parts
 * -----------------------------------------------------------------------------------------------*/

const fmt = (n: number) => n.toLocaleString("en-US")

/** "+12 -3" in tabular figures. Additions in green, deletions in red (grays under `mono`). */
function DiffStat({
  additions,
  deletions,
  tone = "color",
  className,
}: {
  additions: number
  deletions: number
  tone?: DiffTone
  className?: string
}) {
  return (
    <span
      data-slot="diff-stat"
      className={cn(
        "chatcn-text-12 inline-flex shrink-0 gap-1.5 font-mono tabular-nums",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={additions > 0 ? cn("font-medium", TONES[tone].plus) : "text-chatcn-fg-subtle"}
      >
        +{fmt(additions)}
      </span>
      <span
        aria-hidden="true"
        className={deletions > 0 ? TONES[tone].minus : "text-chatcn-fg-subtle"}
      >
        -{fmt(deletions)}
      </span>
      <span className="sr-only">
        {fmt(additions)} added, {fmt(deletions)} removed
      </span>
    </span>
  )
}

/** A path with the directory dimmed, so the file name is what the eye lands on. */
function DiffPath({ path, className }: { path: string; className?: string }) {
  const { dir, name } = splitPath(path)
  const { head, tail } = splitName(name)
  return (
    <span
      data-slot="diff-path"
      dir="ltr"
      className={cn("flex min-w-0 font-mono", className)}
      title={path}
    >
      {/* The folder gives way first; the name only truncates when it alone does not fit, in the
          middle so the extension stays, and always leaves 2ch for the folder's ellipsis. */}
      {dir ? (
        // Gives way from its start, so the nearest folder stays ("…/runs/page.tsx").
        <span className="text-chatcn-fg-subtle min-w-0 truncate [direction:rtl]">
          <span className="[direction:ltr] [unicode-bidi:isolate]">{dir}</span>
        </span>
      ) : null}
      <span className="text-chatcn-fg flex max-w-[calc(100%-2ch)] min-w-0 shrink-0 font-medium">
        <span className="min-w-0 truncate">{head}</span>
        {tail ? <span className="shrink-0">{tail}</span> : null}
      </span>
    </span>
  )
}

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

/* -------------------------------------------------------------------------------------------------
 * Header
 * -----------------------------------------------------------------------------------------------*/

function ViewToggle({ view, onChange }: { view: DiffView; onChange: (view: DiffView) => void }) {
  const item = (value: DiffView, label: string, icon: React.ReactNode) => (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={view === value}
        onClick={() => onChange(value)}
        className={cn(
          "chatcn-focus rounded-chatcn-xs grid size-6 place-items-center [&_svg]:size-3.5",
          "ease-chatcn-standard transition-[background-color,color,box-shadow] duration-150",
          view === value
            ? "bg-chatcn-card text-chatcn-fg shadow-chatcn-xs"
            : "text-chatcn-fg-subtle hover:text-chatcn-fg",
        )}
      >
        {icon}
      </button>
    </Tooltip>
  )
  return (
    // biome-ignore lint/a11y/useSemanticElements: a toolbar-like pair of toggles, not a form fieldset
    <div
      role="group"
      aria-label="Diff layout"
      className="bg-chatcn-fill rounded-chatcn-sm flex shrink-0 items-center p-0.5"
    >
      {item("unified", "Unified", <Rows2Icon />)}
      {item("split", "Split", <Columns2Icon />)}
    </div>
  )
}

const STATUS_LABEL: Partial<Record<DiffFile["status"], string>> = {
  added: "New file",
  deleted: "Deleted",
}

/* -------------------------------------------------------------------------------------------------
 * Hunk
 * -----------------------------------------------------------------------------------------------*/

interface HunkProps {
  hunk: DiffHunk
  index: number
  count: number
  view: DiffView
  tone: DiffTone
  wrap: boolean
  review: boolean
  streaming: boolean
  decision?: HunkDecision
  gap?: DiffGap
  gapExpandable: boolean
  gapOpen: boolean
  extra: DiffLine[]
  peek: boolean
  active: boolean
  numbers: NumberColumns
  onDecide: (decision: HunkDecision | undefined) => void
  onExpandGap: () => void
  onPeek: () => void
  onFocusHunk: () => void
  hunkRef: (el: HTMLDivElement | null) => void
}

function Hunk({
  hunk,
  index,
  count,
  view,
  tone,
  wrap,
  review,
  streaming,
  decision,
  gap,
  gapExpandable,
  gapOpen,
  extra,
  peek,
  active,
  numbers,
  onDecide,
  onExpandGap,
  onPeek,
  onFocusHunk,
  hunkRef,
}: HunkProps) {
  const writing = streaming && !hunk.complete
  const collapsed = decision !== undefined && !peek
  const showGap = Boolean(gap && !gapOpen)
  // Read-only, the expander row also carries the hunk heading, the way GitHub does. While reviewing
  // it stands alone: Accept and Reject sit on the hunk's own row, so they never read as acting on
  // the hidden lines.
  const merged = showGap && !review
  const band = !merged && Boolean(hunk.heading || review || writing)
  const above = index > 0 || showGap || extra.length > 0
  const label = [
    `Change ${index + 1} of ${count}`,
    `${hunk.additions} added, ${hunk.deletions} removed`,
    decision,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable review unit, not a form fieldset
    <div
      ref={hunkRef}
      role="group"
      aria-label={label}
      tabIndex={active ? 0 : -1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusHunk()
      }}
      data-slot="diff-hunk"
      data-index={index}
      data-hunk-state={writing ? "streaming" : (decision ?? "pending")}
      className={cn(
        "group/hunk relative outline-none",
        "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
      )}
    >
      {showGap && gap ? (
        <GapRow
          count={gap.count}
          expandable={gapExpandable}
          onExpand={onExpandGap}
          heading={merged ? hunk.heading : undefined}
          writing={merged && writing}
          className={cn(index > 0 && "border-chatcn-border border-t")}
        />
      ) : null}

      {extra.length > 0 ? (
        // Expanded context belongs above the hunk's header, and stays visible when the hunk collapses.
        <div dir="ltr" className="chatcn-text-13 font-mono">
          <Lines lines={extra} view={view} tone={tone} wrap={wrap} numbers={numbers} />
        </div>
      ) : null}

      {band ? (
        <div
          data-slot="diff-hunk-header"
          className={cn(
            "bg-chatcn-inset chatcn-text-12 text-chatcn-fg-subtle flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 ps-3.5 pe-3.5",
            above && "border-chatcn-border border-t",
          )}
        >
          {hunk.heading ? (
            <span dir="ltr" className="min-w-0 truncate font-mono" title={hunk.heading}>
              {hunk.heading}
            </span>
          ) : (
            <span className="tabular-nums">{rangeLabel(hunk)}</span>
          )}
          {writing ? (
            <ShimmerText className="chatcn-text-12 ms-auto">Writing</ShimmerText>
          ) : review ? (
            <HunkActions
              decision={decision}
              peek={peek}
              additions={hunk.additions}
              deletions={hunk.deletions}
              tone={tone}
              onDecide={onDecide}
              onPeek={onPeek}
            />
          ) : null}
        </div>
      ) : null}

      {collapsed ? null : (
        <div dir="ltr" className="chatcn-text-13 font-mono">
          <Lines
            lines={hunk.lines}
            view={view}
            tone={tone}
            wrap={wrap}
            caret={writing}
            numbers={numbers}
          />
        </div>
      )}
    </div>
  )
}

/** Collapsed unchanged lines between hunks. The chevrons sit in the gutter, over the line numbers. */
function GapRow({
  count,
  expandable,
  onExpand,
  heading,
  writing,
  className,
}: {
  count: number
  expandable: boolean
  onExpand: () => void
  heading?: string
  writing?: boolean
  className?: string
}) {
  const text = `${fmt(count)} unchanged ${count === 1 ? "line" : "lines"}`
  return (
    <div
      data-slot="diff-gap"
      className={cn(
        "bg-chatcn-bg-subtle chatcn-text-12 text-chatcn-fg-subtle flex min-h-8 items-center gap-2 ps-1.5 pe-3.5",
        className,
      )}
    >
      {expandable ? (
        <Button
          size="xs"
          className="text-chatcn-fg-subtle shrink-0 tabular-nums"
          onClick={onExpand}
        >
          <ChevronsUpDownIcon />
          Show {text}
        </Button>
      ) : (
        <span className="shrink-0 ps-2 tabular-nums">{text}</span>
      )}
      {heading ? (
        <span dir="ltr" className="min-w-0 truncate font-mono" title={heading}>
          {heading}
        </span>
      ) : null}
      {writing ? <ShimmerText className="chatcn-text-12 ms-auto">Writing</ShimmerText> : null}
    </div>
  )
}

function rangeLabel(hunk: DiffHunk) {
  const from = hunk.newLines === 0 ? hunk.oldStart : hunk.newStart
  const count = hunk.newLines === 0 ? hunk.oldLines : hunk.newLines
  return count <= 1 ? `Line ${from}` : `Lines ${fmt(from)} to ${fmt(from + count - 1)}`
}

function HunkActions({
  decision,
  peek,
  additions,
  deletions,
  tone,
  onDecide,
  onPeek,
}: {
  decision?: HunkDecision
  peek: boolean
  additions: number
  deletions: number
  tone: DiffTone
  onDecide: (decision: HunkDecision | undefined) => void
  onPeek: () => void
}) {
  const hint = "hidden h-4 min-w-4 px-1 group-focus-within/hunk:inline-flex"
  const touch = "pointer-coarse:h-9 pointer-coarse:px-3"
  if (decision) {
    return (
      <span className="ms-auto flex items-center gap-1">
        <span className="text-chatcn-fg-muted flex items-center gap-1.5 pe-1.5 font-medium [&_svg]:size-3.5">
          <span
            key={decision}
            className="grid place-items-center motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]"
          >
            {decision === "accepted" ? <CheckIcon /> : <XIcon />}
          </span>
          {decision === "accepted" ? "Accepted" : "Rejected"}
        </span>
        <DiffStat additions={additions} deletions={deletions} tone={tone} className="pe-1" />
        <Button size="xs" className={touch} onClick={onPeek} aria-expanded={peek}>
          {peek ? "Hide" : "Show"}
        </Button>
        <Button size="xs" className={touch} onClick={() => onDecide(undefined)}>
          <Undo2Icon />
          Undo
        </Button>
      </span>
    )
  }
  return (
    <span className="ms-auto flex items-center gap-1">
      <Button size="xs" className={touch} onClick={() => onDecide("rejected")}>
        <XIcon />
        Reject
        <Kbd className={hint}>R</Kbd>
      </Button>
      <Button size="xs" className={touch} variant="outline" onClick={() => onDecide("accepted")}>
        <CheckIcon />
        Accept
        <Kbd className={hint}>A</Kbd>
      </Button>
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * DiffViewer
 * -----------------------------------------------------------------------------------------------*/

const EMPTY: Record<string, HunkDecision> = {}

/**
 * A file diff for reviewing agent changes: unified or split, word-level highlights, collapsed
 * unchanged regions, per-hunk Accept and Reject with j/k navigation, streaming patches and a guard
 * for very large files. Red and green by default; `tone="mono"` keeps it to grays and weight.
 */
function DiffViewer({
  file: fileProp,
  patch,
  oldText,
  newText,
  path,
  oldPath,
  view: viewProp,
  defaultView = "unified",
  onViewChange,
  viewToggle = true,
  tone = "color",
  context = 3,
  words = true,
  streaming = false,
  review: reviewProp,
  decisions: decisionsProp,
  defaultDecisions,
  onDecisionChange,
  onDecideAll,
  bulkActions = true,
  maxLines = 1000,
  wrap = false,
  header = true,
  actions,
  variant = "card",
  className,
  ...props
}: DiffViewerProps) {
  const file = React.useMemo<DiffFile | undefined>(() => {
    if (fileProp) return fileProp
    if (patch !== undefined) return parsePatch(patch, { streaming, words, path })[0]
    if (oldText !== undefined || newText !== undefined)
      return diffText(oldText ?? "", newText ?? "", { path, oldPath, context, words })
    return undefined
  }, [fileProp, patch, streaming, words, path, oldText, newText, oldPath, context])

  const shownPath = file?.path || path || ""
  const hunks = file?.hunks ?? []

  const [viewState, setViewState] = React.useState(defaultView)
  const view = viewProp ?? viewState
  const setView = (next: DiffView) => {
    if (viewProp === undefined) setViewState(next)
    onViewChange?.(next)
  }

  const review =
    reviewProp ??
    (decisionsProp !== undefined ||
      defaultDecisions !== undefined ||
      onDecisionChange !== undefined)
  const [decisionState, setDecisionState] = React.useState(defaultDecisions ?? EMPTY)
  const decisions = decisionsProp ?? decisionState
  const [announcement, setAnnouncement] = React.useState("")

  const decide = (hunk: DiffHunk, index: number, decision: HunkDecision | undefined) => {
    if (decisionsProp === undefined) {
      setDecisionState((prev) => {
        const next = { ...prev }
        if (decision) next[hunk.id] = decision
        else delete next[hunk.id]
        return next
      })
    }
    onDecisionChange?.(hunk.id, decision)
    setAnnouncement(`Change ${index + 1} ${decision ?? "back to pending"}`)
  }

  const decideAll = (decision: HunkDecision | undefined) => {
    if (decisionsProp === undefined) {
      setDecisionState(decision ? Object.fromEntries(hunks.map((h) => [h.id, decision])) : EMPTY)
    }
    if (onDecideAll) onDecideAll(decision)
    else for (const hunk of hunks) onDecisionChange?.(hunk.id, decision)
    setAnnouncement(decision ? `All changes ${decision}` : "All changes back to pending")
  }

  // Collapsed regions and decided hunks the user chose to look at again.
  const [openGaps, setOpenGaps] = React.useState<ReadonlySet<number>>(() => new Set())
  const [peeks, setPeeks] = React.useState<ReadonlySet<string>>(() => new Set())
  const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  const gaps = React.useMemo(() => (file ? diffGaps(file) : []), [file])
  const gapAt = (index: number) => gaps.find((g) => g.index === index)
  const expandable = Boolean(file?.source)

  // Large file guard. A diff that started streaming stays visible however large it grows.
  const totalLines = hunks.reduce((sum, h) => sum + h.lines.length, 0)
  const [revealed, setRevealed] = React.useState(false)
  React.useEffect(() => {
    if (streaming) setRevealed(true)
  }, [streaming])
  const guarded = !revealed && !streaming && totalLines > maxLines

  // Gutter width follows the largest line number, so short files get a narrow gutter.
  const maxNumber = hunks.reduce(
    (max, h) => {
      return Math.max(max, h.oldStart + h.oldLines, h.newStart + h.newLines)
    },
    file?.source ? Math.max(file.source.old.length, file.source.new.length) : 0,
  )
  const digits = Math.max(2, String(maxNumber).length)
  // A new file has no old numbers and a deleted file no new ones, so the empty column goes.
  const numbers: NumberColumns =
    file?.status === "added" ? "new" : file?.status === "deleted" ? "old" : "both"

  // Announce once when a stream finishes, never per hunk.
  const wasStreaming = React.useRef(streaming)
  React.useEffect(() => {
    if (wasStreaming.current && !streaming && file) {
      setAnnouncement(
        `Diff ready: ${file.hunks.length} ${file.hunks.length === 1 ? "change" : "changes"}, ${file.additions} added, ${file.deletions} removed`,
      )
    }
    wasStreaming.current = streaming
  }, [streaming, file])

  /* Keyboard: j/k or arrows move between hunks, a accepts, r rejects, u clears. */
  const [active, setActive] = React.useState(0)
  const hunkEls = React.useRef<Array<HTMLDivElement | null>>([])
  const focusHunk = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), hunks.length - 1)
    const el = hunkEls.current[clamped]
    if (!el) return
    setActive(clamped)
    // Keyboard-driven, so nothing animates: focus and scroll land instantly.
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: "nearest" })
  }
  const nextPending = (from: number, decided: string) => {
    for (let i = from + 1; i < hunks.length; i++) {
      const h = hunks[i] as DiffHunk
      if (h.id !== decided && !decisions[h.id] && h.complete) return i
    }
    return -1
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, [contenteditable='true']")) return
    const el = target.closest<HTMLElement>("[data-slot='diff-hunk']")
    if (!el) return
    const index = Number(el.dataset.index)
    const hunk = hunks[index]
    if (!hunk) return
    const key = event.key
    const onHunk = target === el
    if (key === "j" || key === "ArrowDown") focusHunk(index + 1)
    else if (key === "k" || key === "ArrowUp") focusHunk(index - 1)
    else if (key === "Home" && onHunk) focusHunk(0)
    else if (key === "End" && onHunk) focusHunk(hunks.length - 1)
    else if (review && hunk.complete && (key === "a" || key === "r")) {
      decide(hunk, index, key === "a" ? "accepted" : "rejected")
      const next = nextPending(index, hunk.id)
      focusHunk(next === -1 ? index : next)
    } else if (review && key === "u" && decisions[hunk.id]) decide(hunk, index, undefined)
    else return
    event.preventDefault()
  }

  const pending = hunks.filter((h) => !decisions[h.id]).length
  const statusLabel = file ? STATUS_LABEL[file.status] : undefined
  const trailing = gapAt(hunks.length)
  const streamingEmpty = streaming && hunks.length === 0

  let body: React.ReactNode
  if (guarded) {
    body = (
      <div className="flex flex-col items-start gap-3 px-4 py-5">
        <div className="flex flex-col gap-1">
          <p className="chatcn-text-14 text-chatcn-fg font-medium">This diff is large</p>
          <p className="chatcn-text-13 text-chatcn-fg-muted text-pretty tabular-nums">
            {fmt(totalLines)} lines in {fmt(hunks.length)} {hunks.length === 1 ? "hunk" : "hunks"}.
            Rendering it all at once can slow the page down.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>
          Show anyway
        </Button>
      </div>
    )
  } else if (file?.binary) {
    body = <p className="chatcn-text-13 text-chatcn-fg-subtle px-4 py-5">Binary file not shown.</p>
  } else if (streamingEmpty) {
    body = (
      <p className="chatcn-text-13 px-4 py-5">
        <ShimmerText>Writing changes</ShimmerText>
      </p>
    )
  } else if (hunks.length === 0) {
    body = (
      <p className="chatcn-text-13 text-chatcn-fg-subtle px-4 py-5">
        {file?.status === "renamed" ? "Renamed without changes." : "No changes."}
      </p>
    )
  } else {
    body = (
      <>
        {hunks.map((hunk, index) => {
          const gap = gapAt(index)
          const gapOpen = gap ? openGaps.has(index) : false
          return (
            <Hunk
              key={hunk.id}
              hunk={hunk}
              index={index}
              count={hunks.length}
              view={view}
              tone={tone}
              wrap={wrap}
              review={review}
              streaming={streaming}
              decision={decisions[hunk.id]}
              gap={gap}
              gapExpandable={expandable}
              gapOpen={gapOpen}
              extra={gap && gapOpen && file ? gapLines(file, gap) : []}
              peek={peeks.has(hunk.id)}
              active={index === Math.min(active, hunks.length - 1)}
              numbers={numbers}
              onDecide={(d) => decide(hunk, index, d)}
              onExpandGap={() => setOpenGaps((s) => toggle(s, index))}
              onPeek={() => setPeeks((s) => toggle(s, hunk.id))}
              onFocusHunk={() => setActive(index)}
              hunkRef={(el) => {
                hunkEls.current[index] = el
              }}
            />
          )
        })}
        {trailing && file && !streaming ? (
          openGaps.has(hunks.length) ? (
            <div dir="ltr" className="chatcn-text-13 font-mono">
              <Lines
                lines={gapLines(file, trailing)}
                view={view}
                tone={tone}
                wrap={wrap}
                numbers={numbers}
              />
            </div>
          ) : (
            <GapRow
              count={trailing.count}
              expandable
              onExpand={() => setOpenGaps((s) => toggle(s, hunks.length))}
              className="border-chatcn-border border-t"
            />
          )
        ) : null}
      </>
    )
  }

  return (
    <div
      data-slot="diff-viewer"
      data-view={view}
      data-tone={tone}
      data-variant={variant}
      data-diff-state={streaming ? "streaming" : guarded ? "guarded" : "ready"}
      className={cn(
        "chatcn-text-13 text-chatcn-fg min-w-0",
        variant === "card" && "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm overflow-hidden",
        className,
      )}
      style={{ "--diff-num": `calc(${digits}ch + 1rem)` } as React.CSSProperties}
      {...props}
    >
      {header ? (
        <div
          data-slot="diff-viewer-header"
          className="border-chatcn-border flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3.5 py-1.5"
        >
          {/* The path never sets the viewer's minimum width (inline-size containment); below
              about 12 rem the stats and controls wrap to their own line instead of squeezing it. */}
          <div className="chatcn-text-13 flex min-w-0 flex-1 basis-48 items-center gap-1.5 [contain:inline-size]">
            {file?.oldPath ? (
              <>
                <DiffPath path={file.oldPath} className="max-w-[40%] opacity-70" />
                <ArrowRightIcon
                  aria-label="renamed to"
                  className="text-chatcn-fg-subtle size-3.5 shrink-0 rtl:rotate-180"
                />
              </>
            ) : null}
            <DiffPath path={shownPath || "Untitled"} />
            {statusLabel ? (
              <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 ps-1">
                {statusLabel}
              </span>
            ) : null}
            {shownPath ? (
              <CopyButton
                size="icon-xs"
                value={shownPath}
                label="Copy path"
                className="text-chatcn-fg-subtle shrink-0"
              />
            ) : null}
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            {file && !file.binary ? (
              <DiffStat additions={file.additions} deletions={file.deletions} tone={tone} />
            ) : null}
            {review && bulkActions && hunks.length > 0 && !streaming && !guarded ? (
              pending > 0 ? (
                <span className="flex shrink-0 items-center gap-1 ps-1">
                  <Button size="xs" onClick={() => decideAll("rejected")}>
                    Reject all
                  </Button>
                  <Button size="xs" variant="solid" onClick={() => decideAll("accepted")}>
                    Accept all
                  </Button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 ps-1">
                  <span className="chatcn-text-12 text-chatcn-fg-muted flex items-center gap-1 pe-1 font-medium [&_svg]:size-3.5">
                    <CheckIcon />
                    Reviewed
                  </span>
                  <Button size="xs" onClick={() => decideAll(undefined)}>
                    <Undo2Icon />
                    Reset
                  </Button>
                </span>
              )
            ) : null}
            {viewToggle ? <ViewToggle view={view} onChange={setView} /> : null}
            {actions}
          </div>
        </div>
      ) : null}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegates j/k from the hunks inside */}
      <div
        data-slot="diff-viewer-body"
        onKeyDown={onKeyDown}
        // Long lines scroll inside the viewer; they never widen a flex or grid parent that sizes
        // to its content, like a chat message column.
        className="[contain:inline-size]"
      >
        {body}
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

export type { DiffTone, DiffView, DiffViewerProps }
export { DiffPath, DiffStat, DiffViewer }
