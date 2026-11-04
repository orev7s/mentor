"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { StreamingCaret, ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  isToolRunning,
  pickNumber,
  pickString,
  type ToolBaseProps,
  ToolDetail,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { useChatcnStickToBottom } from "@/hooks/use-chatcn-auto-height"
import { CircleStopIcon, RotateCcwIcon, SquareTerminalIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${String.fromCharCode(7)}]*.`, "g")

/** Removes ANSI escape codes. The terminal view is monochrome by design. */
function stripAnsi(text: string) {
  return text.replace(ANSI, "")
}

interface ToolBashProps extends ToolBaseProps {
  command?: string
  /** Standard output so far. Streams while the command runs. */
  output?: string
  /** Standard error. Shown under the output in full ink. */
  stderr?: string
  exitCode?: number
  /** Working directory, shown quietly before the command. */
  cwd?: string
  /** Shows Stop while the command runs. */
  onStop?: () => void
}

/**
 * A shell command: the command in the header, a monochrome terminal in the body that streams
 * output and stays pinned to the bottom until the user scrolls up, then the exit code. Open by
 * default while it runs; the user can close it and it stays closed.
 */
function ToolBash({
  name = "bash",
  command,
  output,
  stderr,
  exitCode,
  cwd,
  onStop,
  defaultOpen,
  ...props
}: ToolBashProps) {
  const running = isToolRunning(props.state, props.decision)
  // Output only flows once the command is complete and executing.
  const executing = running && props.state !== "input-streaming"
  const [initialRunning] = React.useState(running)
  const out = React.useMemo(() => (output ? stripAnsi(output) : ""), [output])
  const err = React.useMemo(() => (stderr ? stripAnsi(stderr) : ""), [stderr])
  const scrollRef = useChatcnStickToBottom(out.length + err.length, { enabled: executing })
  const failed = exitCode !== undefined && exitCode !== 0
  const state = props.state
  const showBody = command !== undefined && state !== "output-denied"
  const onRetry = props.onRetry
  const canRetry = onRetry !== undefined && (failed || state === "output-error")

  const body = showBody ? (
    <div
      data-slot="terminal"
      className="rounded-chatcn-md bg-chatcn-inset chatcn-text-12 min-w-0 overflow-hidden font-mono"
    >
      <div className="flex h-8 min-w-0 items-center gap-2 ps-3 pe-1">
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          {cwd ? <span className="text-chatcn-fg-subtle shrink-0">{cwd}</span> : null}
          <span aria-hidden="true" className="text-chatcn-fg-subtle shrink-0 select-none">
            $
          </span>
          <span className="text-chatcn-fg truncate">{command}</span>
        </span>
        {running && onStop ? (
          <Button size="xs" onClick={onStop} className="font-sans">
            <CircleStopIcon />
            Stop
          </Button>
        ) : (
          <CopyButton size="icon-xs" value={command ?? ""} label="Copy command" />
        )}
      </div>
      {out || err || executing ? (
        // biome-ignore lint/a11y/useSemanticElements: a labelled scroll region, not a form fieldset
        <div
          ref={scrollRef}
          data-slot="terminal-output"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable regions must be reachable by keyboard
          tabIndex={0}
          role="group"
          aria-label="Command output"
          className="border-chatcn-border focus-visible:outline-chatcn-accent chatcn-scroll max-h-64 overflow-auto border-t mask-t-from-[calc(100%-0.5rem)] px-3 py-2 leading-5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <pre className="text-chatcn-fg-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
            {out}
            {err ? (
              <span className="text-chatcn-fg">
                {out && !out.endsWith("\n") ? "\n" : ""}
                {err}
              </span>
            ) : null}
            {executing ? <StreamingCaret /> : null}
          </pre>
        </div>
      ) : null}
      {!running && (exitCode !== undefined || state === "output-available" || canRetry) ? (
        <div className="border-chatcn-border text-chatcn-fg-subtle flex h-8 items-center gap-3 border-t ps-3 pe-1 font-sans tabular-nums">
          {out || err ? null : <span>No output.</span>}
          {exitCode !== undefined ? (
            <span className={cn("ms-auto", !canRetry && "pe-2", failed && "text-chatcn-red")}>
              Exit code {exitCode}
            </span>
          ) : null}
          {canRetry ? (
            // The retry sits where the failure is read, so the fix is one click from the cause.
            <Button size="xs" onClick={onRetry} className={exitCode === undefined ? "ms-auto" : ""}>
              <RotateCcwIcon />
              Run again
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : undefined

  return (
    <ToolCall
      name={name}
      icon={<SquareTerminalIcon />}
      title={running ? "Running" : state === "output-available" ? "Ran" : "Run"}
      detail={
        <ToolDetail
          meta={failed ? <span className="text-chatcn-red">exit {exitCode}</span> : undefined}
        >
          {command}
        </ToolDetail>
      }
      defaultOpen={defaultOpen ?? (initialRunning || state === "output-error")}
      {...props}
    >
      {state === "output-error" && !err && !out ? undefined : body}
    </ToolCall>
  )
}

function ToolBashPart(props: ToolRendererProps) {
  const { part, onStop } = props
  const output = part.output
  return (
    <ToolBash
      {...toolBasePropsFromPart(props)}
      command={pickString(part.input, "command", "cmd", "script")}
      cwd={pickString(part.input, "cwd", "workdir")}
      output={typeof output === "string" ? output : pickString(output, "stdout", "output")}
      stderr={pickString(output, "stderr")}
      exitCode={pickNumber(output, "exitCode", "exit_code", "code")}
      onStop={onStop}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolBashRenderers: ToolRendererMap = {
  bash: ToolBashPart,
  shell: ToolBashPart,
  run_command: ToolBashPart,
  terminal: ToolBashPart,
  exec_command: ToolBashPart,
}

export type { ToolBashProps }
export { stripAnsi, ToolBash, ToolBashPart, toolBashRenderers }
