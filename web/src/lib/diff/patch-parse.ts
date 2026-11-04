import type {
  DiffFile,
  DiffFileStatus,
  DiffHunk,
  ParsePatchOptions,
} from "./diff-types"
import { countChanges, hunkId, makeHunk } from "./hunks"
import { refineWords } from "./word-diff"

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

export { parsePatch }
