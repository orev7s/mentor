"use client"

import { Button } from "@/components/ui/chatcn/button"
import { Kbd } from "@/components/ui/chatcn/kbd"
import { ShimmerText } from "@/components/ui/chatcn/shimmer-text"
import {
  type DiffGap,
  type DiffHunk,
  type DiffLine,
  type HunkDecision,
} from "@/lib/chatcn-diff"
import { ChevronsUpDownIcon, CheckIcon, Undo2Icon, XIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"
import { DiffStat } from "./path"
import { Lines, type NumberColumns } from "./row"
import { fmt, type DiffTone, type DiffView } from "./shared"

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

export type { HunkProps }
export { GapRow, Hunk }