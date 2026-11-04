import type { DiffLine, DiffOpType, DiffSegment } from "./diff-types"
import { myersDiff } from "./myers"

const TOKEN = /\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

/** Below this share of unchanged characters, a pair of lines is a rewrite, not an edit. */
const MIN_SIMILARITY = 0.4

/**
 * Word-level diff of two lines. Returns `null` when the lines have too little in common for word
 * highlights to help: then the whole line is the change.
 */
function diffWords(
  oldLine: string,
  newLine: string,
): { old: DiffSegment[]; new: DiffSegment[] } | null {
  if (oldLine === newLine) return null
  const a = tokenize(oldLine)
  const b = tokenize(newLine)
  const ops = myersDiff(a, b, { budget: 200_000 })

  type Piece = { type: DiffOpType; old: string; new: string }
  const pieces: Piece[] = []
  let i = 0
  let j = 0
  for (const op of ops) {
    const oldText = op.type === "insert" ? "" : a.slice(i, i + op.count).join("")
    const newText = op.type === "delete" ? "" : b.slice(j, j + op.count).join("")
    if (op.type !== "insert") i += op.count
    if (op.type !== "delete") j += op.count
    pieces.push({ type: op.type, old: oldText, new: newText })
  }

  let same = 0
  for (const piece of pieces) if (piece.type === "equal") same += piece.old.trim().length
  const longest = Math.max(oldLine.trim().length, newLine.trim().length, 1)
  if (same / longest < MIN_SIMILARITY) return null

  const toSegments = (side: "old" | "new") => {
    const segments: DiffSegment[] = []
    for (const piece of pieces) {
      const text = piece[side]
      if (!text) continue
      const changed = piece.type !== "equal"
      const last = segments[segments.length - 1]
      if (last && last.changed === changed) last.text += text
      else segments.push({ text, changed })
    }
    // On each side, a lone space or punctuation mark between two changes joins them, so
    // `a + b` to `x - y` reads as one change, not three.
    const merged: DiffSegment[] = []
    for (let k = 0; k < segments.length; k++) {
      const seg = segments[k] as DiffSegment
      const prev = merged[merged.length - 1]
      const next = segments[k + 1]
      const short = seg.text.trim() === "" || seg.text.length === 1
      if (!seg.changed && short && prev?.changed && next?.changed) {
        prev.text += seg.text + next.text
        k++
      } else if (prev && prev.changed === seg.changed) prev.text += seg.text
      else merged.push({ ...seg })
    }
    return merged
  }
  return { old: toSegments("old"), new: toSegments("new") }
}

/**
 * Pairs removed and added lines inside each change block (first with first) and attaches word
 * segments to pairs that look alike. Mutates and returns `lines`.
 */
function refineWords(lines: DiffLine[]): DiffLine[] {
  let i = 0
  while (i < lines.length) {
    if (lines[i]?.kind !== "remove") {
      i++
      continue
    }
    const removeStart = i
    while (lines[i]?.kind === "remove") i++
    const addStart = i
    while (lines[i]?.kind === "add") i++
    const pairs = Math.min(addStart - removeStart, i - addStart)
    for (let p = 0; p < pairs; p++) {
      const removed = lines[removeStart + p] as DiffLine
      const added = lines[addStart + p] as DiffLine
      const words = diffWords(removed.text, added.text)
      if (words) {
        removed.segments = words.old
        added.segments = words.new
      }
    }
  }
  return lines
}

export { diffWords, refineWords, tokenize }
