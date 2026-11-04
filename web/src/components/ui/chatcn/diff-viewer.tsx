"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import { Tooltip } from "@/components/ui/chatcn/tooltip"
import {
  type DiffFile,
  type DiffHunk,
  diffGaps,
  diffText,
  gapLines,
  type HunkDecision,
  parsePatch,
} from "@/lib/chatcn-diff"
import {
  ArrowRightIcon,
  CheckIcon,
  Columns2Icon,
  Rows2Icon,
  Undo2Icon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"
import { GapRow, Hunk } from "./diff/hunk"
import { DiffPath, DiffStat } from "./diff/path"
import { Lines, type NumberColumns } from "./diff/row"
import { fmt, type DiffTone, type DiffView } from "./diff/shared"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

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
