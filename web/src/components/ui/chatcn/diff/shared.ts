"use client"

/* -------------------------------------------------------------------------------------------------
 * Tone
 * Red and green by default, from the `--chatcn-diff-*` tokens: a tinted row, a 1 px rule and a
 * stronger word highlight. The +/- glyphs and the screen reader labels carry the meaning on their
 * own, so `mono` (grays and weight only) reads the same for people who cannot tell the hues apart.
 * -----------------------------------------------------------------------------------------------*/

const TONES = {
  mono: {
    add: "bg-chatcn-alpha-200 text-chatcn-fg before:bg-chatcn-fg",
    remove: "bg-chatcn-alpha-100 text-chatcn-fg-subtle before:bg-chatcn-border-strong",
    addWord: "bg-chatcn-alpha-500 text-chatcn-fg",
    removeWord: "bg-chatcn-alpha-400 text-chatcn-fg-muted",
    addGlyph: "text-chatcn-fg",
    removeGlyph: "text-chatcn-fg-subtle",
    plus: "text-chatcn-fg",
    minus: "text-chatcn-fg-subtle",
    addGutter: "bg-chatcn-alpha-200",
    removeGutter: "bg-chatcn-alpha-100",
  },
  color: {
    add: "bg-chatcn-diff-add-bg text-chatcn-fg before:bg-chatcn-diff-add-fg",
    remove: "bg-chatcn-diff-del-bg text-chatcn-fg before:bg-chatcn-diff-del-fg",
    addWord: "bg-chatcn-diff-add-word-bg text-chatcn-fg",
    removeWord: "bg-chatcn-diff-del-word-bg text-chatcn-fg",
    addGlyph: "text-chatcn-diff-add-fg",
    removeGlyph: "text-chatcn-diff-del-fg",
    plus: "text-chatcn-diff-add-fg",
    minus: "text-chatcn-diff-del-fg",
    addGutter: "bg-chatcn-diff-add-gutter",
    removeGutter: "bg-chatcn-diff-del-gutter",
  },
} as const

type DiffView = "unified" | "split"
type DiffTone = "mono" | "color"

const fmt = (n: number) => n.toLocaleString("en-US")

export type { DiffTone, DiffView }
export { fmt, TONES }
