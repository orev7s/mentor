import type { DiffFile, DiffTextOptions } from "./diff-types"
import { diffText } from "./hunks"

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

export { createPatch, formatPatch }
