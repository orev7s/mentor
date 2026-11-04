export type AnsiHue = "red" | "green" | "amber" | "blue" | "purple" | "teal"

/** Four gray tones plus the kit hues. */
export type AnsiTone = "strong" | "default" | "muted" | "subtle" | AnsiHue

export interface AnsiStyle {
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strike?: boolean
  /** Foreground tone. Undefined means the default text color. */
  tone?: AnsiTone
  /** A colored background becomes that hue's tint; a gray one becomes a subtle fill. */
  background?: "fill" | AnsiHue
  /** OSC 8 hyperlink target. */
  href?: string
}

export interface AnsiSpan {
  text: string
  style: AnsiStyle
}

/** A line of output. Finished lines are frozen and keep their identity across pushes. */
export type AnsiLine = readonly AnsiSpan[]

const ESC = "\u001b"
const BEL = "\u0007"

/** Tones for the 16 basic colors (0 to 7 normal, 8 to 15 bright). */
const BASIC: AnsiTone[] = [
  "subtle", // black: unreadable on dark canvases, so it reads as secondary text
  "red",
  "green",
  "amber", // yellow: pure yellow fails contrast on white, amber reads in both themes
  "blue",
  "purple", // magenta
  "teal", // cyan
  "default", // white
  "subtle", // bright black (gray): the usual "dim" color
  "red",
  "green",
  "amber",
  "blue",
  "purple",
  "teal",
  "strong",
]

/** Hue angle (degrees) to the nearest kit hue. */
function hueFor(angle: number): AnsiHue {
  if (angle < 20 || angle >= 330) return "red"
  if (angle < 70) return "amber"
  if (angle < 160) return "green"
  if (angle < 200) return "teal"
  if (angle < 260) return "blue"
  return "purple"
}

/** Maps an RGB color to a tone: saturated colors take the nearest kit hue, grays go by lightness. */
export function toneForRgb(r: number, g: number, b: number): AnsiTone {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma > 60 && max > 80) {
    let h: number
    if (max === r) h = ((g - b) / chroma) % 6
    else if (max === g) h = (b - r) / chroma + 2
    else h = (r - g) / chroma + 4
    return hueFor((h * 60 + 360) % 360)
  }
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (l < 70) return "subtle"
  if (l < 150) return "muted"
  if (l < 225) return "default"
  return "strong"
}

const HUES = new Set<AnsiTone>(["red", "green", "amber", "blue", "purple", "teal"])
const asBackground = (tone: AnsiTone | undefined): AnsiStyle["background"] =>
  tone && HUES.has(tone) ? (tone as AnsiHue) : "fill"

function rgbFor256(n: number): [number, number, number] {
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return [v, v, v]
  }
  const i = n - 16
  const steps = [0, 95, 135, 175, 215, 255]
  return [steps[Math.floor(i / 36)] ?? 0, steps[Math.floor(i / 6) % 6] ?? 0, steps[i % 6] ?? 0]
}

function toneFor256(n: number): AnsiTone {
  if (n < 16) return BASIC[n] ?? "default"
  const [r, g, b] = rgbFor256(n)
  return toneForRgb(r, g, b)
}

/** Reads an extended color (38;5;n or 38;2;r;g;b) starting at `i`. Returns the tone and new index. */
function readExtended(codes: number[], i: number): [AnsiTone | undefined, number] {
  const mode = codes[i + 1]
  if (mode === 5) return [toneFor256(codes[i + 2] ?? 0), i + 2]
  if (mode === 2) {
    return [toneForRgb(codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0), i + 4]
  }
  return [undefined, i]
}

/** Applies one SGR parameter list to a style. Returns a new style object. */
export function applySgr(style: AnsiStyle, params: string): AnsiStyle {
  const codes = params === "" ? [0] : params.split(/[;:]/).map((p) => (p === "" ? 0 : Number(p)))
  let next: AnsiStyle = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i] ?? 0
    if (c === 0) next = next.href ? { href: next.href } : {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 3) next.italic = true
    else if (c === 4) next.underline = true
    else if (c === 7) next.inverse = true
    else if (c === 9) next.strike = true
    else if (c === 21 || c === 22) {
      next.bold = false
      next.dim = false
    } else if (c === 23) next.italic = false
    else if (c === 24) next.underline = false
    else if (c === 27) next.inverse = false
    else if (c === 29) next.strike = false
    else if (c >= 30 && c <= 37) next.tone = BASIC[c - 30]
    else if (c >= 90 && c <= 97) next.tone = BASIC[c - 90 + 8]
    else if (c === 39) next.tone = undefined
    else if (c >= 40 && c <= 47) next.background = asBackground(BASIC[c - 40])
    else if (c >= 100 && c <= 107) next.background = asBackground(BASIC[c - 100 + 8])
    else if (c === 49) next.background = undefined
    else if (c === 38) {
      const [tone, j] = readExtended(codes, i)
      next.tone = tone
      i = j
    } else if (c === 48) {
      const [tone, j] = readExtended(codes, i)
      next.background = asBackground(tone)
      i = j
    }
  }
  for (const key of Object.keys(next) as (keyof AnsiStyle)[]) {
    if (next[key] === undefined || next[key] === false) delete next[key]
  }
  return next
}

function sameStyle(a: AnsiStyle, b: AnsiStyle) {
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strike === b.strike &&
    a.tone === b.tone &&
    a.background === b.background &&
    a.href === b.href
  )
}

/** Incremental ANSI parser. Feed it chunks; read `lines`. */
export class AnsiParser {
  /** Finished lines. Entries never change once pushed. */
  readonly done: AnsiLine[] = []
  private current: AnsiSpan[] = []
  private style: AnsiStyle = {}
  /** An escape sequence cut off at the end of the last chunk. */
  private pending = ""
  /** A carriage return was seen: the next printable character starts the line over. */
  private rewind = false

  /** Every line, the last one possibly unfinished. */
  get lines(): AnsiLine[] {
    return this.current.length > 0 ? [...this.done, this.current.slice()] : [...this.done]
  }

  /** Number of lines, counting an unfinished last line. */
  get lineCount() {
    return this.done.length + (this.current.length > 0 ? 1 : 0)
  }

  /** The last, unfinished line. Rebuilt on every push. */
  get tail(): AnsiLine {
    return this.current.slice()
  }

  reset() {
    this.done.length = 0
    this.current = []
    this.style = {}
    this.pending = ""
    this.rewind = false
  }

  private write(text: string) {
    if (!text) return
    if (this.rewind) {
      this.current = []
      this.rewind = false
    }
    const last = this.current.at(-1)
    if (last && sameStyle(last.style, this.style)) {
      this.current[this.current.length - 1] = { text: last.text + text, style: last.style }
    } else {
      this.current.push({ text, style: this.style })
    }
  }

  private newline() {
    this.done.push(Object.freeze(this.current))
    this.current = []
    this.rewind = false
  }

  private backspace() {
    const last = this.current.at(-1)
    if (!last) return
    const text = last.text.slice(0, -1)
    if (text) this.current[this.current.length - 1] = { text, style: last.style }
    else this.current.pop()
  }

  /** Feeds the next chunk of raw terminal output. */
  push(chunk: string) {
    const input = this.pending + chunk
    this.pending = ""
    let text = ""
    let i = 0
    const flush = () => {
      this.write(text)
      text = ""
    }
    while (i < input.length) {
      const ch = input[i] as string
      if (ch === ESC) {
        const next = input[i + 1]
        if (next === undefined) {
          flush()
          this.pending = input.slice(i)
          return
        }
        if (next === "[") {
          // CSI: parameters, then one final byte in @ to ~.
          let j = i + 2
          while (j < input.length && !/[@-~]/.test(input[j] as string)) j++
          if (j >= input.length) {
            flush()
            this.pending = input.slice(i)
            return
          }
          const final = input[j]
          const params = input.slice(i + 2, j)
          flush()
          if (final === "m") this.style = applySgr(this.style, params)
          else if (final === "K") {
            // Erase in line. Clearing the whole line or the rest of it both empty our model,
            // because the cursor is always at the end of `current`.
            if (params === "2" || params === "" || params === "0") this.current = []
          } else if (final === "G" && (params === "" || params === "1")) this.rewind = true
          // Everything else (cursor movement, scroll regions, modes) is dropped.
          i = j + 1
          continue
        }
        if (next === "]") {
          // OSC: ends with BEL or ESC \.
          let j = i + 2
          let end = -1
          let terminator = 0
          while (j < input.length) {
            if (input[j] === BEL) {
              end = j
              terminator = 1
              break
            }
            if (input[j] === ESC && input[j + 1] === "\\") {
              end = j
              terminator = 2
              break
            }
            j++
          }
          if (end < 0) {
            flush()
            this.pending = input.slice(i)
            return
          }
          flush()
          const body = input.slice(i + 2, end)
          if (body.startsWith("8;")) {
            const href = body.slice(body.indexOf(";", 2) + 1)
            const next = { ...this.style }
            if (href) next.href = href
            else delete next.href
            this.style = next
          }
          i = end + terminator
          continue
        }
        // Two-byte escapes (ESC 7, ESC c, ...): drop both bytes.
        i += 2
        continue
      }
      if (ch === "\n") {
        flush()
        this.newline()
      } else if (ch === "\r") {
        flush()
        if (input[i + 1] === "\n") {
          this.newline()
          i++
        } else if (i + 1 >= input.length) {
          // Could be the first half of CRLF split across chunks.
          this.pending = "\r"
        } else this.rewind = true
      } else if (ch === "\b") {
        flush()
        this.backspace()
      } else if (ch === "\t" || ch >= " ") {
        text += ch
      }
      i++
    }
    flush()
  }

  /** Plain text without escape codes, for copying. */
  toPlainText() {
    return this.lines.map((line) => line.map((s) => s.text).join("")).join("\n")
  }
}

/** Parses a whole string at once. */
export function parseAnsi(input: string): AnsiLine[] {
  const parser = new AnsiParser()
  parser.push(input)
  return parser.lines
}

/** Removes every escape sequence. */
export function stripAnsi(input: string) {
  return parseAnsi(input)
    .map((line) => line.map((s) => s.text).join(""))
    .join("\n")
}
