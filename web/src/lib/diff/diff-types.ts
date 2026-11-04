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

type HunkDecision = "accepted" | "rejected"

interface DiffGap {
  /** Index of the hunk after the gap, or `hunks.length` for the lines after the last hunk. */
  index: number
  count: number
  oldFrom: number
  newFrom: number
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
