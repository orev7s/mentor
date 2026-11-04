import type {
  DiffFile,
  DiffGap,
  DiffHunk,
  DiffLine,
  HunkDecision,
} from "./diff-types"
import { splitLines } from "./hunks"

/** First old and new line a hunk covers, and where it ends (exclusive). */
function hunkRange(hunk: DiffHunk) {
  const oldFrom = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart
  const newFrom = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart
  return { oldFrom, oldTo: oldFrom + hunk.oldLines, newFrom, newTo: newFrom + hunk.newLines }
}

/**
 * Unchanged regions between hunks. The trailing region is only known when the file has a
 * `source`. Counts come from line numbers, so they work for parsed patches too.
 */
function diffGaps(file: DiffFile): DiffGap[] {
  const gaps: DiffGap[] = []
  let oldNext = 1
  let newNext = 1
  file.hunks.forEach((hunk, index) => {
    const r = hunkRange(hunk)
    const count = r.oldFrom - oldNext
    if (count > 0) gaps.push({ index, count, oldFrom: oldNext, newFrom: newNext })
    oldNext = r.oldTo
    newNext = r.newTo
  })
  if (file.source && file.hunks.length > 0) {
    const count = file.source.old.length - oldNext + 1
    if (count > 0)
      gaps.push({ index: file.hunks.length, count, oldFrom: oldNext, newFrom: newNext })
  }
  return gaps
}

/** The unchanged lines of a gap, when the file has a `source`. */
function gapLines(file: DiffFile, gap: DiffGap): DiffLine[] {
  if (!file.source) return []
  const out: DiffLine[] = []
  for (let c = 0; c < gap.count; c++) {
    const text = file.source.old[gap.oldFrom - 1 + c]
    if (text === undefined) break
    out.push({ kind: "context", text, oldNumber: gap.oldFrom + c, newNumber: gap.newFrom + c })
  }
  return out
}

/**
 * The file after review: accepted hunks take the new lines, rejected hunks keep the old ones.
 * Hunks with no decision follow `pending` (accepted by default, the agent's proposal stands).
 * Needs the old file, from `file.source` or passed in.
 */
function applyHunks(
  file: DiffFile,
  decisions: Record<string, HunkDecision | undefined>,
  options: { pending?: HunkDecision; oldText?: string } = {},
): string {
  const { pending = "accepted" } = options
  const old = options.oldText !== undefined ? splitLines(options.oldText) : file.source?.old
  if (!old) throw new Error("applyHunks needs the old text: pass `oldText` or use diffText")
  const takesAll = file.hunks.every((h) => (decisions[h.id] ?? pending) === "accepted")
  const eol =
    options.oldText !== undefined
      ? options.oldText.endsWith("\n")
      : ((takesAll ? file.source?.newEol : file.source?.oldEol) ?? true)

  const out: string[] = []
  let cursor = 1
  for (const hunk of file.hunks) {
    const r = hunkRange(hunk)
    while (cursor < r.oldFrom && cursor <= old.length) out.push(old[cursor++ - 1] as string)
    const take = (decisions[hunk.id] ?? pending) === "accepted"
    for (const line of hunk.lines) {
      if (line.kind === "context") out.push(line.text)
      else if (line.kind === "add" && take) out.push(line.text)
      else if (line.kind === "remove" && !take) out.push(line.text)
    }
    cursor = r.oldTo
  }
  while (cursor <= old.length) out.push(old[cursor++ - 1] as string)
  if (out.length === 0) return ""
  return out.join("\n") + (eol ? "\n" : "")
}

export { applyHunks, diffGaps, gapLines, hunkRange }
