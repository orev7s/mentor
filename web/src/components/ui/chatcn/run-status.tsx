import * as React from "react"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { formatChatcnDuration, useChatcnElapsed } from "@/hooks/use-chatcn-elapsed"
import {
  CheckIcon,
  CircleDashedIcon,
  CircleStopIcon,
  CircleXIcon,
  HandIcon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

type RunStatusValue = "idle" | "running" | "waiting" | "done" | "failed" | "stopped"

interface RunStatusProps extends Omit<React.ComponentProps<"span">, "children"> {
  status: RunStatusValue
  /** Replaces the default label, for example "Needs approval" for `waiting`. */
  label?: React.ReactNode
  /** Epoch ms when the run started. Measured from the first active render when omitted. */
  startedAt?: number
  /** Final run time in ms. Measured automatically when omitted. */
  durationMs?: number
  /** Show elapsed time next to the label. Defaults to true. */
  showElapsed?: boolean
  /** `badge` sits on a fill; `plain` is for headers that already have a surface. */
  variant?: "badge" | "plain"
}

const LABELS: Record<RunStatusValue, string> = {
  idle: "Idle",
  running: "Running",
  waiting: "Waiting for input",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
}

function RunStatusGlyph({ status }: { status: RunStatusValue }) {
  // Skip the swap on the first paint; play it only for real changes.
  const first = React.useRef(status)
  const changed = React.useRef(false)
  if (status !== first.current) changed.current = true
  const animate = changed.current
  let glyph: React.ReactNode
  let tone = "text-chatcn-fg-subtle"
  switch (status) {
    // Blue is working, amber needs you, green finished, red failed. The label says it in words.
    case "running":
      glyph = <Spinner />
      tone = "text-chatcn-blue"
      break
    case "waiting":
      glyph = <HandIcon />
      tone = "text-chatcn-amber"
      break
    case "done":
      glyph = <CheckIcon />
      tone = "text-chatcn-green"
      break
    case "failed":
      glyph = <CircleXIcon />
      tone = "text-chatcn-red"
      break
    case "stopped":
      glyph = <CircleStopIcon />
      break
    default:
      glyph = <CircleDashedIcon />
  }
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5", tone)}
    >
      <span
        key={status}
        className={cn(
          "grid place-items-center",
          animate && "motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]",
        )}
      >
        {glyph}
      </span>
    </span>
  )
}

/**
 * The state of a whole agent run for a header or a thread row: idle, running, waiting for input,
 * done, failed or stopped, with elapsed time in tabular figures. The label is a polite live
 * region; the ticking time is not.
 */
function RunStatus({
  status,
  label,
  startedAt,
  durationMs,
  showElapsed = true,
  variant = "badge",
  className,
  ...props
}: RunStatusProps) {
  const active = status === "running" || status === "waiting"
  const { ms } = useChatcnElapsed({ running: active, startedAt, durationMs })
  const time =
    showElapsed && status !== "idle" && ms !== undefined && (active ? ms >= 1000 : true)
      ? formatChatcnDuration(ms, { precise: !active })
      : undefined

  return (
    <span
      data-slot="run-status"
      data-run-status={status}
      data-variant={variant}
      className={cn(
        "chatcn-text-12 inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 font-medium whitespace-nowrap",
        variant === "badge" && "bg-chatcn-fill rounded-full ps-2 pe-2.5",
        className,
      )}
      {...props}
    >
      <RunStatusGlyph status={status} />
      <span
        aria-live="polite"
        className={cn("truncate", status === "failed" ? "text-chatcn-red" : "text-chatcn-fg")}
      >
        {label ?? LABELS[status]}
      </span>
      {time ? (
        <span className="text-chatcn-fg-subtle shrink-0 font-normal tabular-nums">{time}</span>
      ) : null}
    </span>
  )
}

export type { RunStatusProps, RunStatusValue }
export { RunStatus }
