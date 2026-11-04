import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  isToolRunning,
  pickNumber,
  pickString,
  type ToolBaseProps,
  ToolDetail,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { DiffIcon, PencilIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Diff model
 * -----------------------------------------------------------------------------------------------*/

interface DiffLine {
  type: "add" | "remove" | "context"
  text: string
  /** Line number in the new file (add, context) or the old file (remove). */
  line?: number
}

const MAX_LCS = 400

/** Line diff of two snippets by longest common subsequence. Small inputs only, which edits are. */
function diffLines(oldText: string, newText: string, startLine = 1): DiffLine[] {
  const a = oldText.replace(/\n$/, "").split("\n")
  const b = newText.replace(/\n$/, "").split("\n")
  if (oldText === "") a.length = 0
  if (a.length > MAX_LCS || b.length > MAX_LCS) {
    return [
      ...a.map((text, i) => ({ type: "remove" as const, text, line: startLine + i })),
      ...b.map((text, i) => ({ type: "add" as const, text, line: startLine + i })),
    ]
  }
  // dp[i * w + j] = LCS length of a[i:] and b[j:], in one flat array.
  const w = b.length + 1
  const dp = new Uint16Array((a.length + 1) * w)
  const at = (i: number, j: number) => dp[i * w + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ type: "context", text: b[j] as string, line: startLine + j })
      i++
      j++
    } else if (i < a.length && (j >= b.length || at(i + 1, j) >= at(i, j + 1))) {
      // Removals first on ties, so a changed line reads old then new, like every diff tool.
      out.push({ type: "remove", text: a[i] as string, line: startLine + i })
      i++
    } else {
      out.push({ type: "add", text: b[j] as string, line: startLine + j })
      j++
    }
  }
  return out
}

/** Parses a unified diff body (`+`, `-` and ` ` prefixed lines, `@@` hunk headers). */
function parseUnifiedDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldLine = 1
  let newLine = 1
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ")) continue
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(raw)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      continue
    }
    if (raw.startsWith("+")) out.push({ type: "add", text: raw.slice(1), line: newLine++ })
    else if (raw.startsWith("-")) out.push({ type: "remove", text: raw.slice(1), line: oldLine++ })
    else if (raw.startsWith(" ")) {
      out.push({ type: "context", text: raw.slice(1), line: newLine })
      oldLine++
      newLine++
    }
  }
  return out
}

/* -------------------------------------------------------------------------------------------------
 * Pieces
 * -----------------------------------------------------------------------------------------------*/

/** "+12 -3" in tabular figures, green and red. A zero count steps back to gray. */
function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span data-slot="diff-stat" className="inline-flex gap-1.5 tabular-nums">
      <span
        className={additions > 0 ? "text-chatcn-diff-add-fg font-medium" : "text-chatcn-fg-subtle"}
      >
        +{additions}
      </span>
      <span className={deletions > 0 ? "text-chatcn-diff-del-fg" : "text-chatcn-fg-subtle"}>
        -{deletions}
      </span>
      <span className="sr-only">
        {additions} added, {deletions} removed
      </span>
    </span>
  )
}

/**
 * A unified mini diff: added lines on a green tint, removed lines on a red tint, with colored
 * signs. The signs and the screen reader labels carry the meaning without color.
 */
function DiffPreview({ lines, maxLines = 60 }: { lines: DiffLine[]; maxLines?: number }) {
  const shown = lines.slice(0, maxLines)
  const hidden = lines.length - shown.length
  return (
    <div
      data-slot="diff-preview"
      className="rounded-chatcn-md bg-chatcn-inset min-w-0 overflow-hidden"
    >
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll areas must be reachable by keyboard
        tabIndex={0}
        aria-label="Changes"
        className="chatcn-scroll chatcn-focus max-h-80 overflow-auto py-1.5 outline-none"
      >
        <pre className="chatcn-text-12 w-max min-w-full font-mono leading-5">
          <code className="grid">
            {shown.map((l, i) => (
              <span
                key={i}
                data-diff={l.type}
                className={cn(
                  "grid grid-cols-[2.75rem_1.25rem_1fr] pe-4",
                  l.type === "add" && "bg-chatcn-diff-add-bg text-chatcn-fg",
                  l.type === "remove" && "bg-chatcn-diff-del-bg text-chatcn-fg",
                  l.type === "context" && "text-chatcn-fg-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pe-3 text-end font-normal tabular-nums select-none",
                    l.type === "context" ? "text-chatcn-fg-subtle" : "text-chatcn-fg-muted",
                  )}
                >
                  {l.line ?? ""}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "text-center select-none",
                    l.type === "add" && "text-chatcn-diff-add-fg",
                    l.type === "remove" && "text-chatcn-diff-del-fg",
                  )}
                >
                  {l.type === "add" ? "+" : l.type === "remove" ? "-" : ""}
                </span>
                <span className="whitespace-pre">
                  <span className="sr-only">
                    {l.type === "add" ? "Added: " : l.type === "remove" ? "Removed: " : ""}
                  </span>
                  {l.text || " "}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </section>
      {hidden > 0 ? (
        <div className="chatcn-text-12 text-chatcn-fg-subtle border-chatcn-border border-t px-3 py-1.5 tabular-nums">
          {hidden} more {hidden === 1 ? "line" : "lines"}
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ToolFileEdit
 * -----------------------------------------------------------------------------------------------*/

interface ToolFileEditProps extends ToolBaseProps {
  path?: string
  /** Text being replaced. Diffed against `newText` when `lines` and `diff` are not given. */
  oldText?: string
  newText?: string
  /** A unified diff, as many agents return it. */
  diff?: string
  /** Precomputed lines. Wins over `diff` and `oldText`/`newText`. */
  lines?: DiffLine[]
  /** Line number where the snippet starts in the file. */
  startLine?: number
  /** Override the counts, for example from the tool output. */
  additions?: number
  deletions?: number
  /** Shows "Open diff" under the preview. */
  onOpenDiff?: () => void
}

/**
 * A file edit: path and "+12 -3" in the header, a unified mini diff in the body. While approval is
 * pending, the diff is what the user approves.
 */
function ToolFileEdit({
  name = "edit_file",
  path,
  oldText,
  newText,
  diff,
  lines: linesProp,
  startLine = 1,
  additions,
  deletions,
  onOpenDiff,
  ...props
}: ToolFileEditProps) {
  const running = isToolRunning(props.state, props.decision)
  const lines = React.useMemo(() => {
    if (linesProp) return linesProp
    if (diff) return parseUnifiedDiff(diff)
    if (oldText !== undefined || newText !== undefined)
      return diffLines(oldText ?? "", newText ?? "", startLine)
    return []
  }, [linesProp, diff, oldText, newText, startLine])
  const adds = additions ?? lines.filter((l) => l.type === "add").length
  const dels = deletions ?? lines.filter((l) => l.type === "remove").length
  const known = lines.length > 0 || additions !== undefined
  const state = props.state

  const showBody =
    lines.length > 0 &&
    state !== "output-error" &&
    state !== "output-denied" &&
    state !== "cancelled"
  const body = showBody ? (
    <div className="flex flex-col gap-2">
      <DiffPreview lines={lines} />
      {onOpenDiff ? (
        <div>
          <Button size="xs" className="-ms-2" onClick={onOpenDiff}>
            <DiffIcon />
            Open diff
          </Button>
        </div>
      ) : null}
    </div>
  ) : undefined

  const title =
    state === "approval-requested"
      ? "Edit"
      : state === "output-denied" || state === "cancelled"
        ? "Edit"
        : running
          ? "Editing"
          : "Edited"

  return (
    <ToolCall
      name={name}
      icon={<PencilIcon />}
      title={title}
      detail={
        <ToolDetail meta={known ? <DiffStat additions={adds} deletions={dels} /> : undefined}>
          {path}
        </ToolDetail>
      }
      {...props}
    >
      {body}
    </ToolCall>
  )
}

function ToolFileEditPart(props: ToolRendererProps) {
  const { part } = props
  const input = part.input
  return (
    <ToolFileEdit
      {...toolBasePropsFromPart(props)}
      path={pickString(input, "path", "file", "filePath", "file_path")}
      oldText={pickString(input, "old", "old_string", "oldText", "search")}
      newText={pickString(input, "new", "new_string", "newText", "replace", "content")}
      diff={pickString(input, "diff", "patch") ?? pickString(part.output, "diff")}
      additions={pickNumber(part.output, "additions", "added")}
      deletions={pickNumber(part.output, "deletions", "removed")}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolFileEditRenderers: ToolRendererMap = {
  edit_file: ToolFileEditPart,
  edit: ToolFileEditPart,
  str_replace: ToolFileEditPart,
  apply_patch: ToolFileEditPart,
  multi_edit: ToolFileEditPart,
}

export type { DiffLine, ToolFileEditProps }
export {
  DiffPreview,
  DiffStat,
  diffLines,
  parseUnifiedDiff,
  ToolFileEdit,
  ToolFileEditPart,
  toolFileEditRenderers,
}
