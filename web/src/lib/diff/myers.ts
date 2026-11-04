import type { DiffOp, DiffOpType } from "./diff-types"

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

export { myersDiff, slideBlocks }
