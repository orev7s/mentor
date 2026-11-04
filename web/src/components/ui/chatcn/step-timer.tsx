import type * as React from "react"
import { formatChatcnDuration, useChatcnElapsed } from "@/hooks/use-chatcn-elapsed"
import { cn } from "@/lib/utils"

interface StepTimerProps extends Omit<React.ComponentProps<"span">, "children" | "prefix"> {
  /** True while the step runs. The counter ticks once per second, in whole seconds. */
  running?: boolean
  /** Epoch ms when the step started. Measured from the first running render when omitted. */
  startedAt?: number
  /** Final duration. Shown once `running` is false. */
  durationMs?: number
  /**
   * Hide the live counter until this much time has passed, so quick steps never flash a timer.
   * Defaults to 1000 ms.
   */
  showAfter?: number
  /** Shown while running before `showAfter`, for example "Running". Nothing by default. */
  placeholder?: React.ReactNode
  /** Format for the final duration: `precise` keeps decimals under 10 s. Defaults to true. */
  precise?: boolean
  /** Text before the time, for example "Thought for". */
  prefix?: React.ReactNode
}

function isoDuration(ms: number) {
  return `PT${Math.max(0, Math.round(ms / 100) / 10)}S`
}

/**
 * Elapsed and final duration for a step, set in tabular figures so the width never jitters.
 * Not a live region: a timer that speaks every second is noise. Announce completion elsewhere.
 */
function StepTimer({
  running = false,
  startedAt,
  durationMs,
  showAfter = 1000,
  placeholder = null,
  precise = true,
  prefix,
  className,
  ...props
}: StepTimerProps) {
  const { ms } = useChatcnElapsed({ running, startedAt, durationMs })

  let time: string | null = null
  if (running && ms !== undefined && ms >= showAfter)
    time = formatChatcnDuration(ms, { precise: false })
  else if (!running && ms !== undefined) time = formatChatcnDuration(ms, { precise })
  const content = time ?? (running ? placeholder : null)

  if (content === null || content === undefined) return null

  return (
    <span
      data-slot="step-timer"
      data-running={running ? "" : undefined}
      role={running ? "timer" : undefined}
      className={cn("chatcn-text-12 text-chatcn-fg-subtle tabular-nums", className)}
      {...props}
    >
      {/* The placeholder stands alone; a prefix only reads well in front of a time. */}
      {prefix && time !== null ? <>{prefix} </> : null}
      {time !== null && ms !== undefined ? <time dateTime={isoDuration(ms)}>{time}</time> : content}
    </span>
  )
}

export type { StepTimerProps }
export { StepTimer }
