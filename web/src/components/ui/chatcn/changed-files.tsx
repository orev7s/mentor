import * as React from "react"
import {
  type DiffFileStatus,
  diffStats,
  STATUS_LETTER,
  splitName,
  splitPath,
} from "@/lib/chatcn-diff"
import { CheckIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

/** What the list needs from a file. A `DiffFile` from chatcn-diff fits as is. */
interface ChangedFile {
  path: string
  oldPath?: string
  status: DiffFileStatus
  additions: number
  deletions: number
}

interface ChangedFilesProps extends Omit<React.ComponentProps<"div">, "title" | "defaultValue"> {
  files: ChangedFile[]
  /** Selected path. Controlled. */
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (path: string) => void
  /** Header title. Defaults to "Review changes". Pass `null` to hide the header. */
  title?: React.ReactNode
  /** Controls at the end of the header, for example Accept all. */
  actions?: React.ReactNode
  /** Paths the user has finished reviewing. They show a check and step back. */
  reviewed?: ReadonlyArray<string>
  /** Skeleton rows while the change set loads. */
  loading?: boolean
  /** `plain` sits inside your surface; `card` draws its own. */
  variant?: "plain" | "card"
}

/* -------------------------------------------------------------------------------------------------
 * Parts
 * -----------------------------------------------------------------------------------------------*/

const STATUS_NAME: Record<DiffFileStatus, string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
}

/** A, M, D or R in a tinted badge. The letter is the signal; the hue (green, amber, red, blue) backs it up. */
function FileStatusBadge({ status, className }: { status: DiffFileStatus; className?: string }) {
  return (
    <span
      data-slot="file-status"
      data-file-status={status}
      title={STATUS_NAME[status]}
      className={cn(
        "rounded-chatcn-xs chatcn-text-12 grid size-4 shrink-0 place-items-center font-mono leading-none font-medium",
        // The familiar code review colors: added green, modified amber, deleted red, renamed blue.
        status === "added"
          ? "bg-chatcn-green-bg text-chatcn-diff-add-fg shadow-[inset_0_0_0_1px_var(--chatcn-green-border)]"
          : status === "deleted"
            ? "bg-chatcn-red-bg text-chatcn-diff-del-fg shadow-[inset_0_0_0_1px_var(--chatcn-red-border)]"
            : status === "renamed"
              ? "bg-chatcn-blue-bg text-chatcn-blue shadow-[inset_0_0_0_1px_var(--chatcn-blue-border)]"
              : "bg-chatcn-amber-bg text-chatcn-amber shadow-[inset_0_0_0_1px_var(--chatcn-amber-border)]",
        className,
      )}
    >
      <span aria-hidden="true">{STATUS_LETTER[status]}</span>
      <span className="sr-only">{STATUS_NAME[status]}</span>
    </span>
  )
}

/**
 * Five cells that show the share of added to removed lines, the way GitHub does: green for added,
 * red for removed, a faint cell for unused when the change is under five lines.
 */
function ChangeBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  const cells = 5
  const used = Math.min(cells, total)
  let added = total === 0 ? 0 : Math.round((additions / total) * used)
  // A file with any additions keeps at least one ink cell, and the same for deletions.
  if (additions > 0 && added === 0) added = 1
  if (deletions > 0 && added === used && used > 1) added = used - 1
  const removed = used - added
  return (
    <span
      data-slot="change-bar"
      aria-hidden="true"
      // In a narrow list the path needs the room more than the bar does; the counts stay.
      className="flex shrink-0 gap-px @max-[19rem]/files:hidden"
    >
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-[2px]",
            i < added
              ? "bg-chatcn-diff-add-fg"
              : i < added + removed
                ? "bg-chatcn-diff-del-fg"
                : "bg-chatcn-fill-active",
          )}
        />
      ))}
    </span>
  )
}

function Counts({
  additions,
  deletions,
  selected,
}: {
  additions: number
  deletions: number
  selected?: boolean
}) {
  // On the selected row's darker fill the subtle gray drops under 4.5:1, so it steps up to muted.
  const dim = selected ? "text-chatcn-fg-muted" : "text-chatcn-fg-subtle"
  return (
    <span className="chatcn-text-12 inline-flex shrink-0 gap-1.5 font-mono tabular-nums">
      <span
        aria-hidden="true"
        className={additions > 0 ? "text-chatcn-diff-add-fg font-medium" : dim}
      >
        +{additions.toLocaleString("en-US")}
      </span>
      <span aria-hidden="true" className={deletions > 0 ? "text-chatcn-diff-del-fg" : dim}>
        -{deletions.toLocaleString("en-US")}
      </span>
      <span className="sr-only">
        {additions} added, {deletions} removed
      </span>
    </span>
  )
}

/** A file name that truncates in the middle, so the extension and the end of the stem stay. */
function FileName({ name }: { name: string }) {
  const { head, tail } = splitName(name)
  return (
    <>
      <span className="min-w-0 truncate">{head}</span>
      {tail ? <span className="shrink-0">{tail}</span> : null}
    </>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ChangedFiles
 * -----------------------------------------------------------------------------------------------*/

/**
 * The files an agent changed: status letter, path with the directory dimmed, +/- counts and a
 * five-cell bar. Selecting a file is how you open its diff. A listbox with arrow keys,
 * Home and End; selection follows focus like tabs.
 */
function ChangedFiles({
  files,
  value: valueProp,
  defaultValue,
  onValueChange,
  title = "Review changes",
  actions,
  reviewed,
  loading = false,
  variant = "plain",
  className,
  ...props
}: ChangedFilesProps) {
  const [valueState, setValueState] = React.useState<string | null>(
    defaultValue === undefined ? (files[0]?.path ?? null) : defaultValue,
  )
  const value = valueProp === undefined ? valueState : valueProp
  const select = (path: string) => {
    if (valueProp === undefined) setValueState(path)
    onValueChange?.(path)
  }

  const totals = diffStats(files)
  const done = new Set(reviewed)
  const optionEls = React.useRef<Array<HTMLDivElement | null>>([])
  const selectedIndex = Math.max(
    0,
    files.findIndex((f) => f.path === value),
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const current = optionEls.current.indexOf(event.target as HTMLDivElement)
    if (current === -1) return
    let next = current
    if (event.key === "ArrowDown" || event.key === "j") next = current + 1
    else if (event.key === "ArrowUp" || event.key === "k") next = current - 1
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = files.length - 1
    else if (event.key === "Enter" || event.key === " ") {
      const file = files[current]
      if (file) select(file.path)
      event.preventDefault()
      return
    } else return
    event.preventDefault()
    next = Math.min(Math.max(next, 0), files.length - 1)
    const file = files[next]
    if (!file) return
    select(file.path)
    optionEls.current[next]?.focus()
  }

  const fileWord = files.length === 1 ? "file" : "files"

  return (
    <div
      data-slot="changed-files"
      data-variant={variant}
      className={cn(
        "chatcn-text-13 text-chatcn-fg @container/files flex min-w-0 flex-col",
        variant === "card" && "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm",
        className,
      )}
      {...props}
    >
      {title !== null ? (
        <div
          data-slot="changed-files-header"
          className={cn(
            "flex min-h-11 items-center gap-2 py-1.5 ps-3.5",
            // Buttons in `actions` carry their own inset; plain counts line up with the rows' 14 px.
            actions ? "pe-2" : "pe-3.5",
          )}
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h3 className="chatcn-text-14 truncate font-medium">{title}</h3>
            {loading || files.length === 0 ? null : (
              <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
                {files.length} {fileWord}
              </span>
            )}
          </div>
          {loading || files.length === 0 ? null : (
            <Counts additions={totals.additions} deletions={totals.deletions} />
          )}
          {actions}
        </div>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading changed files"
          className="flex flex-col gap-px p-1.5 pt-0"
        >
          {[64, 48, 72, 40].map((w) => (
            <div key={w} className="flex h-8 items-center gap-2.5 px-2">
              <span className="bg-chatcn-fill rounded-chatcn-xs size-4" />
              <span className="bg-chatcn-fill rounded-chatcn-xs h-2.5" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <p className="chatcn-text-13 text-chatcn-fg-subtle px-3.5 pb-4 text-pretty">
          No files changed yet. Edits appear here as they land.
        </p>
      ) : (
        <div
          role="listbox"
          aria-label="Changed files"
          onKeyDown={onKeyDown}
          className="flex flex-col gap-px p-1.5 pt-0"
        >
          {files.map((file, index) => {
            const selected = file.path === value
            const isDone = done.has(file.path)
            const { dir, name } = splitPath(file.path)
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the listbox (roving focus)
              <div
                key={file.path}
                ref={(el) => {
                  optionEls.current[index] = el
                }}
                role="option"
                aria-selected={selected}
                tabIndex={index === selectedIndex ? 0 : -1}
                onClick={() => select(file.path)}
                data-slot="changed-file"
                data-reviewed={isDone || undefined}
                title={file.oldPath ? `${file.oldPath} to ${file.path}` : file.path}
                className={cn(
                  "rounded-chatcn-sm group/file flex h-8 cursor-default items-center gap-2.5 px-2 outline-none select-none pointer-coarse:h-11",
                  "ease-chatcn-standard transition-colors duration-150",
                  "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
                  selected ? "bg-chatcn-fill-active" : "hover:bg-chatcn-fill-hover",
                )}
              >
                <FileStatusBadge status={file.status} />
                <span
                  dir="ltr"
                  className={cn(
                    // Inline-size containment: a long path never sets the list's minimum width.
                    "flex min-w-0 flex-1 font-mono [contain:inline-size]",
                    file.status === "deleted" &&
                      (selected ? "text-chatcn-fg" : "text-chatcn-fg-subtle"),
                  )}
                >
                  {/* The directory gives way first. The name only truncates when it alone does
                      not fit, in the middle so the extension stays, and always leaves 2ch for the
                      directory's ellipsis. */}
                  {dir ? (
                    // The folder gives way from its start, so the nearest folder stays readable
                    // ("…/runs/load-more.tsx"). The inner run is isolated, so slashes keep their order.
                    <span
                      className={cn(
                        "min-w-0 truncate [direction:rtl]",
                        selected ? "text-chatcn-fg" : "text-chatcn-fg-subtle",
                      )}
                    >
                      <span className="[direction:ltr] [unicode-bidi:isolate]">{dir}</span>
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "flex max-w-[calc(100%-2ch)] min-w-0 shrink-0",
                      isDone
                        ? "text-chatcn-fg-muted"
                        : file.status === "deleted"
                          ? selected
                            ? "text-chatcn-fg"
                            : "text-chatcn-fg-subtle"
                          : "text-chatcn-fg",
                      selected && "font-medium",
                    )}
                  >
                    <FileName name={name} />
                  </span>
                </span>
                <Counts additions={file.additions} deletions={file.deletions} selected={selected} />
                {isDone ? (
                  <span className="text-chatcn-fg-muted flex w-[2.75rem] shrink-0 justify-end @max-[19rem]/files:w-auto [&_svg]:size-3.5">
                    <CheckIcon aria-hidden="true" />
                    <span className="sr-only">Reviewed</span>
                  </span>
                ) : (
                  <ChangeBar additions={file.additions} deletions={file.deletions} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export type { ChangedFile, ChangedFilesProps }
export { ChangeBar, ChangedFiles, FileName, FileStatusBadge }
