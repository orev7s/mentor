import * as React from "react"
import {
  FileTextIcon,
  GlobeIcon,
  PencilIcon,
  PlugIcon,
  SquareTerminalIcon,
  ToolIcon,
  WebSearchIcon,
} from "@/lib/chatcn-icons"
import { type ToolDisplayState } from "@/lib/chatcn-types"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export type ApprovalScope = "once" | "always"

export interface ToolCallApprovalRequest {
  /** Approval id from the runtime, passed back to `onApprove` and `onDeny`. */
  id: string
  /** Why the agent wants to run this tool. Shown above the actions. */
  reason?: React.ReactNode
}

export interface ToolCallProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Tool name from the model, for example `edit_file`. Picks a default icon and label. */
  name: string
  /** Human label. Defaults to a readable version of `name`. */
  title?: React.ReactNode
  /** Short context next to the title, set in mono. A path, a query or a command. */
  detail?: React.ReactNode
  /** Override the tool icon. */
  icon?: React.ReactNode
  state: ToolDisplayState
  /** Parsed tool input. */
  input?: unknown
  /** Raw input text while it streams. Parsed tolerantly so partial JSON renders as it arrives. */
  inputText?: string
  /** Tool output. Strings render as text, anything else as JSON. Pass a node for a custom view. */
  output?: unknown
  /** What the output copy button copies. Defaults to the output as text; elements are not copied. */
  outputCopyValue?: string
  /** Extra header content before the status label, such as a result count or a +12 -3 summary. */
  meta?: React.ReactNode
  /** Name used in "Always allow ...". Defaults to the title with its first letter lowercased. */
  approvalTarget?: string
  /**
   * Replaces the header status label, for example "Blocked by policy" instead of "Failed".
   * A custom label is shown in the neutral tone; the red error tone is only for the default.
   */
  statusLabel?: React.ReactNode
  errorText?: React.ReactNode
  approval?: ToolCallApprovalRequest
  /** The approval decision, shown after the user responds. */
  decision?: { approved: boolean; scope?: ApprovalScope; reason?: string }
  onApprove?: (approvalId: string, scope: ApprovalScope) => void
  onDeny?: (approvalId: string, reason?: string) => void
  onRetry?: () => void
  /** Run time in ms, shown once the tool finishes. */
  durationMs?: number
  /** Epoch ms when the tool started. Drives the live elapsed counter while running. */
  startedAt?: number
  variant?: "card" | "inline"
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

const RUNNING: ToolDisplayState[] = ["input-streaming", "input-available", "approval-responded"]

export function isRunning(state: ToolDisplayState, decision?: ToolCallProps["decision"]) {
  if (state === "approval-responded" && decision?.approved === false) return false
  return RUNNING.includes(state)
}

export function humanize(name: string) {
  const words = name
    .replace(/^tool-/, "")
    .replace(/[_-]+/g, " ")
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function iconFor(name: string) {
  const n = name.toLowerCase()
  if (/search|query|lookup/.test(n) && /web|internet|google|bing/.test(n)) return <WebSearchIcon />
  if (/fetch|browse|url|http/.test(n)) return <GlobeIcon />
  if (/bash|shell|command|terminal|exec|run/.test(n)) return <SquareTerminalIcon />
  if (/edit|write|patch|replace|create/.test(n)) return <PencilIcon />
  if (/read|open|view|cat|file/.test(n)) return <FileTextIcon />
  if (/search|grep|glob|find/.test(n)) return <WebSearchIcon />
  if (/mcp|connector|plugin/.test(n)) return <PlugIcon />
  return <ToolIcon />
}

const NBSP = "\u00a0"

/**
 * Final durations keep a decimal under 10 s. Live counters (`precise: false`) tick in whole
 * seconds, so the figure turns over once a second and never shows a frozen ".0".
 */
export function formatDuration(ms: number, precise = true) {
  if (precise && ms < 1000) return `${Math.max(1, Math.round(ms))}${NBSP}ms`
  const s = ms / 1000
  if (precise && s < 10) return `${s.toFixed(1)}${NBSP}s`
  if (s < 60) return `${precise ? Math.round(s) : Math.floor(s)}${NBSP}s`
  const total = Math.floor(s)
  return `${Math.floor(total / 60)}${NBSP}m ${total % 60}${NBSP}s`
}

export function useElapsed(startedAt: number | undefined, active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active || startedAt === undefined) return
    setNow(Date.now())
    // Ticks once per second: a counter that changes faster only adds noise.
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active, startedAt])
  if (!active || startedAt === undefined) return undefined
  return Math.max(0, now - startedAt)
}

/** Measures run time itself when the caller passes no timing, so durations show up for free. */
export function useAutoTiming(running: boolean, done: boolean) {
  const [startedAt, setStartedAt] = React.useState<number>()
  const [durationMs, setDurationMs] = React.useState<number>()
  React.useEffect(() => {
    if (running && startedAt === undefined) setStartedAt(Date.now())
    if (done && startedAt !== undefined && durationMs === undefined)
      setDurationMs(Date.now() - startedAt)
  }, [running, done, startedAt, durationMs])
  return { startedAt, durationMs }
}

const DETAIL_KEYS = [
  "path",
  "file",
  "filePath",
  "query",
  "command",
  "cmd",
  "url",
  "pattern",
  "name",
]

export function detailFrom(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  for (const key of DETAIL_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}
