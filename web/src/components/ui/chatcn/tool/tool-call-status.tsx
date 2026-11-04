import * as React from "react"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { BanIcon, CircleStopIcon, CircleXIcon, HandIcon } from "@/lib/chatcn-icons"
import { type ToolDisplayState } from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"
import { formatDuration, isRunning, type ToolCallProps } from "./tool-call-shared"

/* -------------------------------------------------------------------------------------------------
 * Status
 * -----------------------------------------------------------------------------------------------*/

/** Status glyph. Swaps with a short blur crossfade so state changes read as one object changing. */
export function ToolCallStatus({
  state,
  decision,
  icon,
}: {
  state: ToolDisplayState
  decision?: ToolCallProps["decision"]
  icon: React.ReactNode
}) {
  let glyph: React.ReactNode = icon
  let key = "idle"
  let tone = "text-chatcn-fg-subtle"

  if (isRunning(state, decision)) {
    glyph = <Spinner />
    key = "running"
    tone = "text-chatcn-blue"
  } else if (state === "approval-requested") {
    glyph = <HandIcon />
    key = "approval"
    tone = "text-chatcn-amber"
  } else if (state === "output-error") {
    glyph = <CircleXIcon />
    key = "error"
    tone = "text-chatcn-red"
  } else if (
    state === "output-denied" ||
    (state === "approval-responded" && decision?.approved === false)
  ) {
    glyph = <BanIcon />
    key = "denied"
  } else if (state === "cancelled") {
    glyph = <CircleStopIcon />
    key = "cancelled"
  }

  return (
    <span
      data-slot="tool-call-status"
      className={cn("relative grid size-4 shrink-0 place-items-center [&_svg]:size-4", tone)}
    >
      <span
        key={key}
        className="grid place-items-center motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]"
      >
        {glyph}
      </span>
    </span>
  )
}

export function statusLabel(props: {
  state: ToolDisplayState
  decision?: ToolCallProps["decision"]
  durationMs?: number
  elapsed?: number
}) {
  const { state, decision, durationMs, elapsed } = props
  switch (state) {
    case "input-streaming":
    case "input-available":
      return elapsed !== undefined && elapsed >= 1000 ? formatDuration(elapsed, false) : "Running"
    case "approval-requested":
      return "Needs approval"
    case "approval-responded":
      if (decision?.approved === false) return "Denied"
      return elapsed !== undefined && elapsed >= 1000 ? formatDuration(elapsed, false) : "Running"
    case "output-available":
      return durationMs !== undefined ? formatDuration(durationMs) : "Done"
    case "output-error":
      return "Failed"
    case "output-denied":
      return "Denied"
    case "cancelled":
      return "Cancelled"
  }
}
