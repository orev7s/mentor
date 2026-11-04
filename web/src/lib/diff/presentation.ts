import type { DiffFile, DiffFileStatus, DiffLine } from "./diff-types"

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
 * of the stem plus the extension) always stays, so "navigation-provider.tsx" reads "navig...ider.tsx".
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

export { diffStats, splitName, splitPath, splitRows, STATUS_LETTER }
