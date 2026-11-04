type DiffOpType = "equal" | "insert" | "delete"

/** A run of equal, inserted or deleted items. Deletes always come before inserts in a change. */
interface DiffOp {
  type: DiffOpType
  count: number
}

type DiffLineKind = "context" | "add" | "remove"

/** A piece of a changed line. `changed` pieces are the words that differ from the paired line. */
interface DiffSegment {
  text: string
  changed: boolean
}

interface DiffLine {
  kind: DiffLineKind
  text: string
  /** Line number in the old file. Set on context and removed lines. */
  oldNumber?: number
  /** Line number in the new file. Set on context and added lines. */
  newNumber?: number
  /** Word-level highlights, only on removed and added lines that pair up and look alike. */
  segments?: DiffSegment[]
}

interface DiffHunk {
  /** Stable id from the hunk position, for example `h-40-42`. */
  id: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  /** The text after the second `@@`, usually the enclosing function. */
  heading?: string
  lines: DiffLine[]
  additions: number
  deletions: number
  /** False while a streamed hunk is still arriving. */
  complete: boolean
}

type DiffFileStatus = "added" | "modified" | "deleted" | "renamed"

interface DiffFile {
  path: string
  /** Previous path, set on renames. */
  oldPath?: string
  status: DiffFileStatus
  hunks: DiffHunk[]
  additions: number
  deletions: number
  binary?: boolean
  /** Both full versions, when known. Lets a viewer expand collapsed unchanged lines. */
  source?: DiffSource
  /** False while a streamed patch is still writing this file. */
  complete: boolean
}

interface DiffSource {
  old: string[]
  new: string[]
  /** Whether the old text ended with a newline, kept by `applyHunks`. */
  oldEol: boolean
  newEol: boolean
}

interface DiffTextOptions {
  path?: string
  oldPath?: string
  status?: DiffFileStatus
  /** Unchanged lines kept around each change. Defaults to 3. */
  context?: number
  /** Word-level highlights on changed lines. Defaults to true. */
  words?: boolean
  /** Work budget for the line diff. Above it, the rest becomes one delete plus one insert. */
  budget?: number
}

interface ParsePatchOptions {
  /** Word-level highlights on finished hunks. Defaults to true. */
  words?: boolean
  /** The text may stop mid-hunk. The last hunk and file are marked incomplete. */
  streaming?: boolean
  /** Path for a patch with no file headers. */
  path?: string
}

/* -------------------------------------------------------------------------------------------------
 * Myers diff
 * -----------------------------------------------------------------------------------------------*/

const DEFAULT_BUDGET = 20_000_000

class OpList {
  ops: DiffOp[] = []
  push(type: DiffOpType, count: number) {
    if (count <= 0) return
    const last = this.ops[this.ops.length - 1]
    if (last && last.type === type) last.count += count
    else this.ops.push({ type, count })
  }
}

/** Maps items to small integers so the inner loop compares numbers, never strings. */
function intern<T>(a: readonly T[], b: readonly T[]): [Int32Array, Int32Array] {
  const ids = new Map<T, number>()
  const map = (list: readonly T[]) => {
    const out = new Int32Array(list.length)
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as T
      let id = ids.get(item)
      if (id === undefined) {
        id = ids.size
        ids.set(item, id)
      }
      out[i] = id
    }
    return out
  }
  return [map(a), map(b)]
}

/**
 * Shortest edit script from `a` to `b`. Items compare with `===`. Within each change, deletes
 * come before inserts, the order every diff tool shows.
 */
function myersDiff<T>(
  a: readonly T[],
  b: readonly T[],
  options: { budget?: number } = {},
): DiffOp[] {
  const [x, y] = intern(a, b)
  const out = new OpList()
  const state = { budget: options.budget ?? DEFAULT_BUDGET }
  diffRange(x, 0, x.length, y, 0, y.length, out, state)
  return normalize(out.ops)
}

function diffRange(
  a: Int32Array,
  aLo: number,
  aHi: number,
  b: Int32Array,
  bLo: number,
  bHi: number,
  out: OpList,
  state: { budget: number },
) {
  let prefix = 0
  while (aLo + prefix < aHi && bLo + prefix < bHi && a[aLo + prefix] === b[bLo + prefix]) prefix++
  out.push("equal", prefix)
  aLo += prefix
  bLo += prefix

  let suffix = 0
  while (aHi - suffix > aLo && bHi - suffix > bLo && a[aHi - 1 - suffix] === b[bHi - 1 - suffix])
    suffix++
  aHi -= suffix
  bHi -= suffix

  if (aLo === aHi) out.push("insert", bHi - bLo)
  else if (bLo === bHi) out.push("delete", aHi - aLo)
  else bisect(a, aLo, aHi, b, bLo, bHi, out, state)

  out.push("equal", suffix)
}

/**
 * Finds the middle snake by walking forward from the start and backward from the end at once,
 * then recurses on both halves. Memory stays linear in the input size.
 */
function bisect(
  a: Int32Array,
  aLo: number,
  aHi: number,
  b: Int32Array,
  bLo: number,
  bHi: number,
  out: OpList,
  state: { budget: number },
) {
  const n = aHi - aLo
  const m = bHi - bLo
  const maxD = Math.ceil((n + m) / 2)
  const offset = maxD
  const size = 2 * maxD + 2
  const v1 = new Int32Array(size).fill(-1)
  const v2 = new Int32Array(size).fill(-1)
  v1[offset + 1] = 0
  v2[offset + 1] = 0
  const delta = n - m
  // With an odd delta the paths meet on a forward step, otherwise on a backward step.
  const front = delta % 2 !== 0
  let k1start = 0
  let k1end = 0
  let k2start = 0
  let k2end = 0

  for (let d = 0; d < maxD; d++) {
    if (state.budget <= 0) break
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = offset + k1
      let x1 =
        k1 === -d || (k1 !== d && (v1[k1o - 1] as number) < (v1[k1o + 1] as number))
          ? (v1[k1o + 1] as number)
          : (v1[k1o - 1] as number) + 1
      let y1 = x1 - k1
      const from1 = x1
      while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
        x1++
        y1++
      }
      state.budget -= x1 - from1 + 1
      v1[k1o] = x1
      if (x1 > n) k1end += 2
      else if (y1 > m) k1start += 2
      else if (front) {
        const k2o = offset + delta - k1
        if (k2o >= 0 && k2o < size && v2[k2o] !== -1) {
          const x2 = n - (v2[k2o] as number)
          if (x1 >= x2) {
            diffRange(a, aLo, aLo + x1, b, bLo, bLo + y1, out, state)
            diffRange(a, aLo + x1, aHi, b, bLo + y1, bHi, out, state)
            return
          }
        }
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = offset + k2
      let x2 =
        k2 === -d || (k2 !== d && (v2[k2o - 1] as number) < (v2[k2o + 1] as number))
          ? (v2[k2o + 1] as number)
          : (v2[k2o - 1] as number) + 1
      let y2 = x2 - k2
      const from2 = x2
      while (x2 < n && y2 < m && a[aHi - 1 - x2] === b[bHi - 1 - y2]) {
        x2++
        y2++
      }
      state.budget -= x2 - from2 + 1
      v2[k2o] = x2
      if (x2 > n) k2end += 2
      else if (y2 > m) k2start += 2
      else if (!front) {
        const k1o = offset + delta - k2
        if (k1o >= 0 && k1o < size && v1[k1o] !== -1) {
          const x1 = v1[k1o] as number
          const y1 = offset + x1 - k1o
          if (x1 >= n - x2) {
            diffRange(a, aLo, aLo + x1, b, bLo, bLo + y1, out, state)
            diffRange(a, aLo + x1, aHi, b, bLo + y1, bHi, out, state)
            return
          }
        }
      }
    }
  }
  // Over budget, or no overlap found: replace the whole range.
  out.push("delete", n)
  out.push("insert", m)
}

/** Merges runs and puts every delete before the inserts of the same change. */
function normalize(ops: DiffOp[]): DiffOp[] {
  const out = new OpList()
  let del = 0
  let ins = 0
  const flush = () => {
    out.push("delete", del)
    out.push("insert", ins)
    del = 0
    ins = 0
  }
  for (const op of ops) {
    if (op.type === "equal") {
      flush()
      out.push("equal", op.count)
    } else if (op.type === "delete") del += op.count
    else ins += op.count
  }
  flush()
  return out.ops
}

/**
 * Slides pure insert and pure delete blocks along runs of identical lines so they read the way a
 * person would write them. Myers may report `+ }` `+` `+ export interface X {` ... where the
 * natural block is `+ export interface X {` ... `+ }` `+`. Among the equivalent positions this
 * picks the lowest one whose last line is blank, else the lowest one, like git's slider.
 */
function slideBlocks(ops: DiffOp[], a: readonly string[], b: readonly string[]): DiffOp[] {
  type Entry = { k: DiffOpType; text: string }
  const entries: Entry[] = []
  let i = 0
  let j = 0
  for (const op of ops) {
    for (let c = 0; c < op.count; c++) {
      if (op.type === "delete") entries.push({ k: op.type, text: a[i++] as string })
      else {
        entries.push({ k: op.type, text: b[j] as string })
        j++
        if (op.type === "equal") i++
      }
    }
  }

  let s = 0
  while (s < entries.length) {
    const kind = (entries[s] as Entry).k
    if (kind === "equal") {
      s++
      continue
    }
    let e = s
    while (e < entries.length && (entries[e] as Entry).k === kind) e++
    const pure =
      (s === 0 || (entries[s - 1] as Entry).k === "equal") &&
      (e === entries.length || (entries[e] as Entry).k === "equal")
    if (!pure) {
      s = e
      continue
    }
    const at = (n: number) => entries[n] as Entry
    // Slide up as far as possible.
    while (s > 0 && at(s - 1).k === "equal" && at(s - 1).text === at(e - 1).text) {
      at(e - 1).k = "equal"
      at(s - 1).k = kind
      s--
      e--
    }
    // Walk down, remembering the best stop.
    let best = s
    let bestBlank = at(e - 1).text.trim() === ""
    while (e < entries.length && at(e).k === "equal" && at(s).text === at(e).text) {
      at(s).k = "equal"
      at(e).k = kind
      s++
      e++
      const blank = at(e - 1).text.trim() === ""
      if (blank || !bestBlank) {
        best = s
        bestBlank = blank
      }
    }
    // Slide back up to the best stop.
    while (s > best) {
      at(e - 1).k = "equal"
      at(s - 1).k = kind
      s--
      e--
    }
    s = e
  }

  const out = new OpList()
  for (const entry of entries) out.push(entry.k, 1)
  return out.ops
}

/* -------------------------------------------------------------------------------------------------
 * Words
 * -----------------------------------------------------------------------------------------------*/

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

/* -------------------------------------------------------------------------------------------------
 * Files and hunks
 * -----------------------------------------------------------------------------------------------*/

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

/* -------------------------------------------------------------------------------------------------
 * Unified diff parsing
 * -----------------------------------------------------------------------------------------------*/

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

function stripPrefix(path: string) {
  const clean = path.replace(/\t.*$/, "").trim()
  if (clean === "/dev/null") return undefined
  return clean.replace(/^"(.*)"$/, "$1").replace(/^[ab]\//, "")
}

interface Draft {
  path: string
  oldPath?: string
  status?: DiffFileStatus
  binary?: boolean
  hunks: DiffHunk[]
  /** The file came from bare `+`, `-` and space lines with no `@@` header. */
  headerless: boolean
  /** Lines still expected by the open hunk's header. */
  oldLeft: number
  newLeft: number
  oldNumber: number
  newNumber: number
}

const HEADERISH = /^(?:diff|---|\+\+\+|@@|index|new |deleted|rename|similarity|Binary)/

/**
 * Parses unified diff text: one or more files with `diff --git`, `---`/`+++` headers, renames,
 * new and deleted files, binary markers and `@@` hunks. A bare list of `+`, `-` and space lines
 * also works. With `streaming`, an unfinished last hunk renders as far as it has arrived and is
 * marked incomplete.
 */
function parsePatch(text: string, options: ParsePatchOptions = {}): DiffFile[] {
  const { words = true, streaming = false } = options
  const rows = text.split("\n")
  // A finished patch ends with a newline. Without one, a streamed patch stopped mid-line.
  const partialTail = streaming && !text.endsWith("\n") && text !== ""
  if (rows[rows.length - 1] === "") rows.pop()

  const files: Draft[] = []
  let file: Draft | undefined
  let hunk: DiffHunk | undefined
  let tailHunk: DiffHunk | undefined

  const newFile = (path = options.path ?? ""): Draft => {
    const draft: Draft = {
      path,
      hunks: [],
      headerless: false,
      oldLeft: 0,
      newLeft: 0,
      oldNumber: 1,
      newNumber: 1,
    }
    files.push(draft)
    return draft
  }
  const openHunk = (
    draft: Draft,
    oldStart: number,
    oldLines: number,
    newStart: number,
    newLines: number,
    heading?: string,
  ) => {
    hunk = {
      id: hunkId(oldStart, newStart),
      oldStart,
      oldLines,
      newStart,
      newLines,
      ...(heading ? { heading } : {}),
      lines: [],
      additions: 0,
      deletions: 0,
      complete: false,
    }
    draft.hunks.push(hunk)
    draft.oldLeft = oldLines
    draft.newLeft = newLines
    draft.oldNumber = oldLines === 0 ? oldStart + 1 : oldStart
    draft.newNumber = newLines === 0 ? newStart + 1 : newStart
  }
  const pushLine = (draft: Draft, open: DiffHunk, sign: string, body: string) => {
    if (sign === "+") open.lines.push({ kind: "add", text: body, newNumber: draft.newNumber++ })
    else if (sign === "-")
      open.lines.push({ kind: "remove", text: body, oldNumber: draft.oldNumber++ })
    else
      open.lines.push({
        kind: "context",
        text: body,
        oldNumber: draft.oldNumber++,
        newNumber: draft.newNumber++,
      })
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] as string
    const line = row.endsWith("\r") ? row.slice(0, -1) : row
    const lastRow = r === rows.length - 1
    const sign = line[0] ?? " "

    // Inside a hunk the header counts say what each line is, so `--- x` can be a removed line.
    if (file && hunk && !file.headerless && (file.oldLeft > 0 || file.newLeft > 0)) {
      const fits =
        (sign === "+" && file.newLeft > 0) ||
        (sign === "-" && file.oldLeft > 0) ||
        (sign === " " && file.oldLeft > 0 && file.newLeft > 0)
      if (fits) {
        pushLine(file, hunk, sign, line.slice(1))
        if (sign !== "+") file.oldLeft--
        if (sign !== "-") file.newLeft--
        if (lastRow && partialTail) tailHunk = hunk
        continue
      }
      if (sign === "\\") continue
      // The header undercounted: whatever this is, it is not part of the hunk.
      file.oldLeft = 0
      file.newLeft = 0
    }

    if (sign === "\\") continue
    // A header that is still arriving waits until it is whole, and `---` until its `+++`.
    if (lastRow && streaming && (partialTail ? HEADERISH.test(line) : line.startsWith("--- ")))
      continue

    if (line.startsWith("diff --git ")) {
      const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(line)
      file = newFile(m?.[2] ?? "")
      hunk = undefined
      if (m?.[1] && m[2] && m[1] !== m[2]) file.oldPath = m[1]
      continue
    }

    const header = HUNK_HEADER.exec(line)
    if (header) {
      if (!file || file.headerless) file = newFile()
      openHunk(
        file,
        Number(header[1]),
        header[2] === undefined ? 1 : Number(header[2]),
        Number(header[3]),
        header[4] === undefined ? 1 : Number(header[4]),
        header[5]?.trim(),
      )
      continue
    }

    if (line.startsWith("--- ") && rows[r + 1]?.startsWith("+++ ")) {
      // Without `diff --git`, a second `---` starts the next file of a plain patch.
      if (!file || file.hunks.length > 0) file = newFile()
      hunk = undefined
      const from = stripPrefix(line.slice(4))
      const to = stripPrefix((rows[r + 1] as string).slice(4))
      if (from === undefined) file.status = "added"
      if (to === undefined) file.status = "deleted"
      file.path = to ?? from ?? file.path
      if (from && to && from !== to) file.oldPath = from
      r++
      continue
    }

    // File metadata between `diff --git` and the first hunk.
    if (file && file.hunks.length === 0 && !file.headerless && !/^[-+ ]/.test(line)) {
      if (line.startsWith("new file mode")) file.status = "added"
      else if (line.startsWith("deleted file mode")) file.status = "deleted"
      else if (line.startsWith("rename from ")) file.oldPath = line.slice(12)
      else if (line.startsWith("rename to ")) file.path = line.slice(10)
      else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch"))
        file.binary = true
      continue
    }

    // A headerless patch: bare `+`, `-` and space lines. Numbering starts at 1.
    if (/^[-+ ]/.test(line) && (!file || file.hunks.length === 0 || file.headerless)) {
      if (!file) file = newFile()
      if (!file.headerless) {
        file.headerless = true
        openHunk(file, 1, 0, 1, 0)
        file.oldNumber = 1
        file.newNumber = 1
      }
      const open = file.hunks[file.hunks.length - 1] as DiffHunk
      pushLine(file, open, sign, line.slice(1))
      if (lastRow && partialTail) tailHunk = open
    }
  }

  return files.map((draft, index) => {
    const lastFile = index === files.length - 1
    const hunks = draft.hunks.map((h, hi) => {
      const lastHunk = lastFile && hi === draft.hunks.length - 1
      const stillStreaming = streaming && lastHunk
      let next: DiffHunk = h
      let complete: boolean
      if (draft.headerless) {
        next = makeHunk(h.lines, 0, 0)
        complete = !stillStreaming
      } else {
        Object.assign(next, countChanges(h.lines))
        const filled = !(lastHunk && (draft.oldLeft > 0 || draft.newLeft > 0))
        // Finished patches are complete even if a header overcounted.
        complete = stillStreaming ? filled : true
      }
      if (h === tailHunk) complete = false
      if (complete && words) refineWords(next.lines)
      return { ...next, complete }
    })
    const totals = hunks.reduce(
      (sum, h) => ({
        additions: sum.additions + h.additions,
        deletions: sum.deletions + h.deletions,
      }),
      { additions: 0, deletions: 0 },
    )
    const status =
      draft.status ?? (draft.oldPath && draft.oldPath !== draft.path ? "renamed" : "modified")
    const out: DiffFile = {
      path: draft.path,
      ...(draft.oldPath && draft.oldPath !== draft.path ? { oldPath: draft.oldPath } : {}),
      status,
      hunks,
      ...totals,
      ...(draft.binary ? { binary: true } : {}),
      complete: !(streaming && lastFile) && hunks.every((h) => h.complete),
    }
    return out
  })
}

/* -------------------------------------------------------------------------------------------------
 * Formatting
 * -----------------------------------------------------------------------------------------------*/

const range = (start: number, count: number) => (count === 1 ? `${start}` : `${start},${count}`)

/** Writes a file back out as unified diff text, the inverse of `parsePatch`. */
function formatPatch(file: DiffFile): string {
  const oldPath = file.status === "added" ? "/dev/null" : `a/${file.oldPath ?? file.path}`
  const newPath = file.status === "deleted" ? "/dev/null" : `b/${file.path}`
  const out = [`diff --git a/${file.oldPath ?? file.path} b/${file.path}`]
  if (file.status === "added") out.push("new file mode 100644")
  if (file.status === "deleted") out.push("deleted file mode 100644")
  if (file.status === "renamed" && file.oldPath) {
    out.push(`rename from ${file.oldPath}`, `rename to ${file.path}`)
  }
  if (file.binary) {
    out.push(`Binary files ${oldPath} and ${newPath} differ`)
    return `${out.join("\n")}\n`
  }
  if (file.hunks.length > 0) out.push(`--- ${oldPath}`, `+++ ${newPath}`)
  for (const hunk of file.hunks) {
    const heading = hunk.heading ? ` ${hunk.heading}` : ""
    out.push(
      `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@${heading}`,
    )
    for (const line of hunk.lines) {
      out.push(`${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.text}`)
    }
  }
  return `${out.join("\n")}\n`
}

/** One-call unified diff of two texts. */
function createPatch(
  oldText: string,
  newText: string,
  options: DiffTextOptions & { path: string },
): string {
  return formatPatch(diffText(oldText, newText, options))
}

/* -------------------------------------------------------------------------------------------------
 * Review helpers
 * -----------------------------------------------------------------------------------------------*/

type HunkDecision = "accepted" | "rejected"

/** First old and new line a hunk covers, and where it ends (exclusive). */
function hunkRange(hunk: DiffHunk) {
  const oldFrom = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart
  const newFrom = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart
  return { oldFrom, oldTo: oldFrom + hunk.oldLines, newFrom, newTo: newFrom + hunk.newLines }
}

interface DiffGap {
  /** Index of the hunk after the gap, or `hunks.length` for the lines after the last hunk. */
  index: number
  count: number
  oldFrom: number
  newFrom: number
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

/** Side by side rows: context on both sides, removed lines left, added lines right. */
function splitRows(lines: DiffLine[]): Array<{ left?: DiffLine; right?: DiffLine }> {
  const rows: Array<{ left?: DiffLine; right?: DiffLine }> = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as DiffLine
    if (line.kind === "context") {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    const removed: DiffLine[] = []
    const added: DiffLine[] = []
    while (lines[i]?.kind === "remove") removed.push(lines[i++] as DiffLine)
    while (lines[i]?.kind === "add") added.push(lines[i++] as DiffLine)
    for (let r = 0; r < Math.max(removed.length, added.length); r++) {
      rows.push({ left: removed[r], right: added[r] })
    }
  }
  return rows
}

/** Totals across files, for a review header. */
function diffStats(files: ReadonlyArray<Pick<DiffFile, "additions" | "deletions">>) {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    additions += file.additions
    deletions += file.deletions
  }
  return { files: files.length, additions, deletions }
}

/** `src/app/page.tsx` to `{ dir: "src/app/", name: "page.tsx" }`. */
function splitPath(path: string) {
  const slash = path.lastIndexOf("/")
  return slash === -1
    ? { dir: "", name: path }
    : { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

/**
 * Splits a file name for middle truncation: the head may shrink to an ellipsis, the tail (the end
 * of the stem plus the extension) always stays, so "navigation-provider.tsx" reads "navig…ider.tsx".
 */
function splitName(name: string, keep = 8) {
  if (name.length <= keep + 4) return { head: name, tail: "" }
  return { head: name.slice(0, -keep), tail: name.slice(-keep) }
}

const STATUS_LETTER: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
}

export type {
  DiffFile,
  DiffFileStatus,
  DiffGap,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffOp,
  DiffOpType,
  DiffSegment,
  DiffSource,
  DiffTextOptions,
  HunkDecision,
  ParsePatchOptions,
}
export {
  applyHunks,
  createPatch,
  diffGaps,
  diffStats,
  diffText,
  diffWords,
  formatPatch,
  gapLines,
  hunkRange,
  myersDiff,
  parsePatch,
  refineWords,
  STATUS_LETTER,
  slideBlocks,
  splitLines,
  splitName,
  splitPath,
  splitRows,
  tokenize,
}
