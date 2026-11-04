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
} from "./diff-types"
export { myersDiff, slideBlocks } from "./myers"
export { diffWords, refineWords, tokenize } from "./word-diff"
export { countChanges, diffText, hunkId, makeHunk, splitLines, statusFor } from "./hunks"
export { parsePatch } from "./patch-parse"
export { createPatch, formatPatch } from "./patch-format"
export { applyHunks, diffGaps, gapLines, hunkRange } from "./patch-apply"
export { diffStats, splitName, splitPath, splitRows, STATUS_LETTER } from "./presentation"
