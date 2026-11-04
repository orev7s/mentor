"use client"

import { splitName, splitPath } from "@/lib/chatcn-diff"
import { cn } from "@/lib/utils"
import { fmt, TONES, type DiffTone } from "./shared"

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
        // Gives way from its start, so the nearest folder stays (".../runs/page.tsx").
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

export { DiffPath, DiffStat }
