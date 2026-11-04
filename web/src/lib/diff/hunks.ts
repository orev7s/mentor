import type {
  DiffFile,
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  DiffTextOptions,
} from "./diff-types"
import { myersDiff, slideBlocks } from "./myers"
import { refineWords } from "./word-diff"

/** Splits text into lines. A trailing newline does not make an extra empty line. */
function splitLines(text: string): string[] {
  if (text === "") return []
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
}

function countChanges(lines: DiffLine[]) {
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.kind === "add") additions++
    else if (line.kind === "remove") deletions++
  }
  return { additions, deletions }
}

function hunkId(oldStart: number, newStart: number) {
  return `h-${oldStart}-${newStart}`
}

/**
 * Builds a hunk from its lines. `oldBefore` and `newBefore` count the lines that come before it,
 * so an empty side points at the line before the change, like `@@ -12,0 +13,4 @@`.
 */
function makeHunk(lines: DiffLine[], oldBefore: number, newBefore: number, heading?: string) {
  let oldLines = 0
  let newLines = 0
  for (const line of lines) {
    if (line.oldNumber !== undefined) oldLines++
    if (line.newNumber !== undefined) newLines++
  }
  const oldStart = oldLines ? oldBefore + 1 : oldBefore
  const newStart = newLines ? newBefore + 1 : newBefore
  const { additions, deletions } = countChanges(lines)
  const hunk: DiffHunk = {
    id: hunkId(oldStart, newStart),
    oldStart,
    oldLines,
    newStart,
    newLines,
    ...(heading ? { heading } : {}),
    lines,
    additions,
    deletions,
    complete: true,
  }
  return hunk
}

function statusFor(oldText: string, newText: string, path?: string, oldPath?: string) {
  if (oldPath && path && oldPath !== path) return "renamed" as const
  if (oldText === "" && newText !== "") return "added" as const
  if (newText === "" && oldText !== "") return "deleted" as const
  return "modified" as const
}

/** Diffs two versions of a file into hunks with `context` unchanged lines around each change. */
function diffText(oldText: string, newText: string, options: DiffTextOptions = {}): DiffFile {
  const { context = 3, words = true } = options
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const ops = slideBlocks(myersDiff(a, b, { budget: options.budget }), a, b)

  const all: DiffLine[] = []
  // Old and new lines consumed before each entry of `all`, for hunk starts.
  const cursors: Array<[number, number]> = []
  let i = 0
  let j = 0
  for (const op of ops) {
    for (let c = 0; c < op.count; c++) {
      cursors.push([i, j])
      if (op.type === "equal") {
        all.push({ kind: "context", text: b[j] as string, oldNumber: i + 1, newNumber: j + 1 })
        i++
        j++
      } else if (op.type === "delete") {
        all.push({ kind: "remove", text: a[i] as string, oldNumber: i + 1 })
        i++
      } else {
        all.push({ kind: "add", text: b[j] as string, newNumber: j + 1 })
        j++
      }
    }
  }

  // Group changes whose context windows touch into one hunk.
  const hunks: DiffHunk[] = []
  let k = 0
  while (k < all.length) {
    if (all[k]?.kind === "context") {
      k++
      continue
    }
    const start = Math.max(0, k - context)
    let end = k
    let lastChange = k
    while (end < all.length) {
      if (all[end]?.kind !== "context") lastChange = end
      else if (end - lastChange > context * 2) break
      end++
    }
    const stop = Math.min(all.length, lastChange + context + 1)
    const lines = all.slice(start, stop)
    const [oldBefore, newBefore] = cursors[start] as [number, number]
    hunks.push(makeHunk(words ? refineWords(lines) : lines, oldBefore, newBefore))
    k = stop
  }

  const totals = countChanges(all)
  return {
    path: options.path ?? "",
    ...(options.oldPath && options.oldPath !== options.path ? { oldPath: options.oldPath } : {}),
    status: options.status ?? statusFor(oldText, newText, options.path, options.oldPath),
    hunks,
    additions: totals.additions,
    deletions: totals.deletions,
    source: { old: a, new: b, oldEol: oldText.endsWith("\n"), newEol: newText.endsWith("\n") },
    complete: true,
  }
}

export { countChanges, diffText, hunkId, makeHunk, splitLines, statusFor }
