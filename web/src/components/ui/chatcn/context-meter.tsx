"use client"

import type * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/chatcn/popover"
import { CircleAlertIcon, ContextWindowIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface ContextSegment {
  /** Stable key: `system`, `tools`, `messages`, `files` or your own. */
  key: string
  label: string
  tokens: number
}

interface ContextBreakdown {
  system?: number
  tools?: number
  messages?: number
  files?: number
}

interface ContextCompaction {
  /** Tokens freed by the summary. */
  freedTokens?: number
  /** A sentence about what happened. Defaults to "Older messages were summarized." */
  note?: React.ReactNode
}

interface ContextMeterProps extends Omit<React.ComponentProps<"button">, "children"> {
  /** Context window size in tokens: 200000. */
  limit: number
  /** Tokens in use. Defaults to the sum of `breakdown`. */
  used?: number
  /** What fills the window. Order is kept; up to four shades plus free space. */
  breakdown?: ContextBreakdown | ContextSegment[]
  /** `ring` for a toolbar or corner, `bar` for a status line. */
  variant?: "ring" | "bar"
  /** Fraction at which the meter warns that compaction is near. Default 0.8. */
  warnAt?: number
  /** The context was just compacted. Shows a note in the popover and on the trigger. */
  compacted?: boolean | ContextCompaction
  /** Compact now. Shows a button in the warning. */
  onCompact?: () => void
  /** Model name for the popover heading, set in mono. */
  model?: React.ReactNode
  /** Show the percentage next to the ring. Default true. */
  showLabel?: boolean
}

/* -------------------------------------------------------------------------------------------------
 * Numbers
 * -----------------------------------------------------------------------------------------------*/

/** U+202F, a thin space that never breaks: 128 000, not 128,000 or 128.000. */
const THIN = " "

/** Full count with thin-space grouping: 61 000. */
function formatTokens(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN)
}

/** Compact count: 980, 12.4k, 128k, 1.2M. */
function formatTokensShort(n: number) {
  const v = Math.max(0, n)
  if (v < 1000) return `${Math.round(v)}`
  if (v < 1_000_000) {
    const k = v / 1000
    return `${k < 100 ? Number(k.toFixed(1)) : Math.round(k)}k`
  }
  const m = v / 1_000_000
  return `${m < 100 ? Number(m.toFixed(1)) : Math.round(m)}M`
}

const DEFAULT_LABELS: Record<keyof ContextBreakdown, string> = {
  system: "System",
  tools: "Tools",
  messages: "Messages",
  files: "Files",
}

function toSegments(breakdown: ContextMeterProps["breakdown"]): ContextSegment[] {
  if (!breakdown) return []
  if (Array.isArray(breakdown)) return breakdown
  return (Object.keys(DEFAULT_LABELS) as (keyof ContextBreakdown)[])
    .filter((key) => breakdown[key] !== undefined)
    .map((key) => ({ key, label: DEFAULT_LABELS[key], tokens: breakdown[key] ?? 0 }))
}

/**
 * One chart hue per source, in the categorical order, so the stack and its legend pair up at a
 * glance. The legend names each source, so the hue is never the only cue. Free space is the track.
 */
const SHADES = [
  "bg-chatcn-chart-1",
  "bg-chatcn-chart-2",
  "bg-chatcn-chart-3",
  "bg-chatcn-chart-4",
  "bg-chatcn-chart-5",
  "bg-chatcn-chart-6",
]

type ContextLevel = "ok" | "warn" | "critical"

/** Ok is quiet gray, near compaction is amber, almost full is red. */
const LEVEL_FILL: Record<ContextLevel, string> = {
  ok: "bg-chatcn-fg-subtle",
  warn: "bg-chatcn-amber",
  critical: "bg-chatcn-red",
}
const LEVEL_STROKE: Record<ContextLevel, string> = {
  ok: "stroke-chatcn-fg-subtle",
  warn: "stroke-chatcn-amber",
  critical: "stroke-chatcn-red",
}

/* -------------------------------------------------------------------------------------------------
 * Ring and bar
 * -----------------------------------------------------------------------------------------------*/

/** The pie is drawn as a stroke as wide as the circle, so its dash offset sweeps a sector. */
const PIE_R = 2.75
const PIE_C = 2 * Math.PI * PIE_R

/**
 * A 16 px pie inside a hairline ring. A filled sector reads as a gauge at a glance, never as a
 * spinner. It sweeps over 280 ms when usage changes, so a jump reads as growth. Past the warning
 * line it turns amber, and red when nearly full.
 */
function ContextRing({ fraction, level }: { fraction: number; level: ContextLevel }) {
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-slot="context-ring"
      className="size-4 shrink-0 -rotate-90 rtl:scale-x-[-1]"
    >
      <circle
        cx="8"
        cy="8"
        r="6.75"
        strokeWidth="1.25"
        className={cn(
          "transition-[stroke] duration-280 motion-reduce:transition-none",
          level === "ok" ? "stroke-chatcn-border-strong" : LEVEL_STROKE[level],
        )}
      />
      <circle
        cx="8"
        cy="8"
        r={PIE_R}
        strokeWidth={PIE_R * 2}
        strokeDasharray={PIE_C}
        strokeDashoffset={PIE_C * (1 - f)}
        className={cn(
          "ease-chatcn-out transition-[stroke-dashoffset,stroke] duration-280 motion-reduce:transition-none",
          LEVEL_STROKE[level],
        )}
      />
    </svg>
  )
}

function ContextBar({ fraction, level }: { fraction: number; level: ContextLevel }) {
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <span
      aria-hidden="true"
      data-slot="context-bar"
      className="bg-chatcn-fill-active block h-1 w-16 shrink-0 overflow-hidden rounded-full"
    >
      <span
        className={cn(
          "block h-full origin-left rounded-full rtl:origin-right",
          "ease-chatcn-out transition-[transform,background-color] duration-280 motion-reduce:transition-none",
          LEVEL_FILL[level],
        )}
        style={{ transform: `scaleX(${f})` }}
      />
    </span>
  )
}

/** The stacked breakdown: one chart hue per source, hairline gaps, free space last. */
function ContextStack({ segments, limit }: { segments: ContextSegment[]; limit: number }) {
  return (
    <span
      aria-hidden="true"
      data-slot="context-stack"
      className="bg-chatcn-fill-active flex h-2 w-full gap-px overflow-hidden rounded-full"
    >
      {segments.map((segment, i) => (
        <span
          key={segment.key}
          className={cn("h-full shrink-0", SHADES[i % SHADES.length])}
          style={{ width: `${(segment.tokens / limit) * 100}%` }}
        />
      ))}
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ContextMeter
 * -----------------------------------------------------------------------------------------------*/

/**
 * How full the context window is, as a ring or a bar, with a breakdown on click: system prompt,
 * tool definitions, messages, files and what is left. Warns before automatic compaction and
 * says so when it happened. Token counts use tabular figures and thin-space grouping.
 */
function ContextMeter({
  limit,
  used: usedProp,
  breakdown,
  variant = "ring",
  warnAt = 0.8,
  compacted,
  onCompact,
  model,
  showLabel = true,
  className,
  ...props
}: ContextMeterProps) {
  const segments = toSegments(breakdown)
  const used = usedProp ?? segments.reduce((sum, s) => sum + s.tokens, 0)
  const fraction = limit > 0 ? used / limit : 0
  const percent = Math.min(100, Math.round(fraction * 100))
  const warn = fraction >= warnAt
  const critical = fraction >= 0.95
  const level: ContextLevel = critical ? "critical" : warn ? "warn" : "ok"
  const free = Math.max(0, limit - used)
  const compaction = compacted ? (compacted === true ? {} : compacted) : undefined

  return (
    <Popover>
      <PopoverTrigger
        data-slot="context-meter"
        data-variant={variant}
        data-context-level={level}
        // The name starts with the visible text (WCAG 2.5.3), then says what it measures.
        aria-label={`${variant === "bar" ? `${formatTokensShort(used)} / ${formatTokensShort(limit)}` : `${percent}%`}${compaction ? " Compacted" : ""}, context window used: ${formatTokensShort(used)} of ${formatTokensShort(limit)} tokens`}
        className={cn(
          "chatcn-focus rounded-chatcn-sm chatcn-text-12 inline-flex h-7 shrink-0 items-center gap-1.5 px-1.5 tabular-nums select-none",
          "text-chatcn-fg-subtle hover:bg-chatcn-fill-hover hover:text-chatcn-fg ease-chatcn-standard transition-colors duration-150",
          "data-[popup-open]:bg-chatcn-fill data-[popup-open]:text-chatcn-fg",
          warn && "text-chatcn-fg",
          "pointer-coarse:h-11",
          className,
        )}
        {...props}
      >
        {variant === "ring" ? (
          <ContextRing fraction={fraction} level={level} />
        ) : (
          <ContextBar fraction={fraction} level={level} />
        )}
        {showLabel ? (
          <span className={cn(critical && "text-chatcn-red font-medium")}>
            {variant === "bar"
              ? `${formatTokensShort(used)} / ${formatTokensShort(limit)}`
              : `${percent}%`}
          </span>
        ) : null}
        {compaction ? <span className="text-chatcn-fg-subtle">Compacted</span> : null}
      </PopoverTrigger>

      <PopoverContent aria-label="Context window" side="bottom" align="end" className="w-72 p-0">
        <div className="flex flex-col gap-3 p-3.5">
          <div className="flex items-start gap-2.5">
            <ContextWindowIcon
              aria-hidden="true"
              className="text-chatcn-fg-subtle mt-0.5 size-4 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="chatcn-text-14 text-chatcn-fg font-medium">Context window</span>
              <span className="chatcn-text-12 text-chatcn-fg-subtle tabular-nums">
                {formatTokens(used)} of {formatTokens(limit)} tokens
              </span>
              {model ? (
                <span className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">
                  {model}
                </span>
              ) : null}
            </div>
            <span className="chatcn-text-14 text-chatcn-fg font-medium tabular-nums">
              {percent}%
            </span>
          </div>

          {segments.length > 0 ? (
            <>
              <ContextStack segments={segments} limit={limit} />
              <dl className="chatcn-text-13 flex flex-col gap-1">
                {segments.map((segment, i) => (
                  <div key={segment.key} className="flex h-5 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn("size-2 shrink-0 rounded-[2px]", SHADES[i % SHADES.length])}
                    />
                    <dt className="text-chatcn-fg-muted flex-1">{segment.label}</dt>
                    <dd className="text-chatcn-fg tabular-nums">{formatTokens(segment.tokens)}</dd>
                  </div>
                ))}
                <div className="flex h-5 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="bg-chatcn-fill-active size-2 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_var(--chatcn-border-strong)]"
                  />
                  <dt className="text-chatcn-fg-subtle flex-1">Free</dt>
                  <dd className="text-chatcn-fg-subtle tabular-nums">{formatTokens(free)}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>

        {compaction ? (
          <div className="border-chatcn-border/70 chatcn-text-13 text-chatcn-fg-muted flex gap-2.5 border-t px-3.5 py-3">
            <ContextWindowIcon
              aria-hidden="true"
              className="text-chatcn-fg-subtle mt-0.5 size-4 shrink-0"
            />
            <p className="text-pretty">
              <span className="text-chatcn-fg font-medium">Context compacted. </span>
              {compaction.note ?? "Older messages were summarized."}
              {compaction.freedTokens ? (
                <span className="tabular-nums">
                  {" "}
                  {formatTokensShort(compaction.freedTokens)} tokens freed.
                </span>
              ) : null}
            </p>
          </div>
        ) : warn ? (
          <div className="border-chatcn-border/70 chatcn-text-13 text-chatcn-fg-muted flex flex-col gap-2.5 border-t px-3.5 py-3">
            <p className="flex gap-2.5 text-pretty">
              <CircleAlertIcon
                aria-hidden="true"
                className="text-chatcn-fg mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="text-chatcn-fg font-medium">{percent}% full. </span>
                Older messages will be summarized soon to make room. Compact now to choose the
                moment.
              </span>
            </p>
            {onCompact ? (
              <Button size="sm" variant="outline" onClick={onCompact} className="self-end">
                Compact now
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The divider a transcript shows where compaction happened, so the user knows why the agent may
 * have forgotten details from before it.
 */
function ContextCompactionDivider({
  freedTokens,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { freedTokens?: number }) {
  return (
    <div
      role="note"
      data-slot="context-compaction"
      className={cn(
        "chatcn-text-12 text-chatcn-fg-subtle flex min-h-8 items-center gap-3 tabular-nums",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="bg-chatcn-border h-px flex-1" />
      <span className="flex items-center gap-1.5">
        <ContextWindowIcon aria-hidden="true" className="size-3.5" />
        {children ?? (
          <>
            Context compacted
            {freedTokens ? <> · {formatTokensShort(freedTokens)} tokens summarized</> : null}
          </>
        )}
      </span>
      <span aria-hidden="true" className="bg-chatcn-border h-px flex-1" />
    </div>
  )
}

export type { ContextBreakdown, ContextCompaction, ContextMeterProps, ContextSegment }
export { ContextCompactionDivider, ContextMeter, formatTokens, formatTokensShort }
