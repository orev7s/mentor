"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { Tooltip } from "@/components/ui/chatcn/tooltip"
import { useChatcnTerminalFollow } from "@/hooks/use-chatcn-terminal-follow"
import { type AnsiLine, AnsiParser, type AnsiSpan, type AnsiStyle } from "@/lib/chatcn-ansi"
import {
  ArrowDownIcon,
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  SquareTerminalIcon,
  WrapTextIcon,
} from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface TerminalProps extends Omit<React.ComponentProps<"div">, "children" | "title"> {
  /** Raw output, escape codes included. While streaming, pass the whole text so far. */
  text: string
  /** The command that produced the output, shown in the header after a `$`. */
  command?: string
  /** Header label when there is no single command, for example `zsh` or a task name. */
  title?: React.ReactNode
  /** Working directory, shown after the command in the header. */
  cwd?: string
  /** The process is running: spinner, live elapsed time, follow mode active. */
  running?: boolean
  /** Exit code once the process ends. Non-zero shows as a failure. */
  exitCode?: number | null
  /** Run time in ms, shown next to the exit code. Measured automatically when omitted. */
  durationMs?: number
  /** Epoch ms when the process started. Drives the live elapsed counter. */
  startedAt?: number
  /** Wrap long lines. Controlled. */
  wrap?: boolean
  /** Initial wrap state. Default false, like a terminal. */
  defaultWrap?: boolean
  onWrapChange?: (wrap: boolean) => void
  /** Pin to the newest line. Controlled. Any upward scroll turns it off. */
  follow?: boolean
  defaultFollow?: boolean
  onFollowChange?: (follow: boolean) => void
  /** Called by Clear and Ctrl L. Without it, Clear hides the current lines locally. */
  onClear?: () => void
  /** Adds an input line. Called with the command when the user presses Enter. */
  onCommand?: (command: string) => void
  /** Ctrl C while running. */
  onInterrupt?: () => void
  /** Prompt before the input line. Default `$`. */
  prompt?: React.ReactNode
  /** Placeholder for the input line. */
  placeholder?: string
  /** Fixed height of the output area. Number means px. */
  height?: number | string
  /** Maximum height when `height` is not set. Default 360. */
  maxHeight?: number | string
  /** Only the last `maxLines` render until the user asks for everything. Default 1000. */
  maxLines?: number
  /** Hide the header row (for a terminal inside another panel). */
  hideHeader?: boolean
  /** Extra header actions, placed before the built-in ones. */
  actions?: React.ReactNode
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

const NBSP = "\u00a0"

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}${NBSP}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}${NBSP}s`
  if (s < 60) return `${Math.round(s)}${NBSP}s`
  return `${Math.floor(s / 60)}${NBSP}m ${Math.round(s % 60)}${NBSP}s`
}

const TONE: Record<NonNullable<AnsiStyle["tone"]>, string> = {
  strong: "text-chatcn-fg font-medium",
  default: "text-chatcn-fg",
  muted: "text-chatcn-fg-muted",
  subtle: "text-chatcn-fg-subtle",
  red: "text-chatcn-red",
  green: "text-chatcn-green",
  amber: "text-chatcn-amber",
  blue: "text-chatcn-blue",
  purple: "text-chatcn-purple",
  teal: "text-chatcn-teal",
}

const BACKGROUND: Record<NonNullable<AnsiStyle["background"]>, string> = {
  fill: "bg-chatcn-fill-active",
  red: "bg-chatcn-red-bg",
  green: "bg-chatcn-green-bg",
  amber: "bg-chatcn-amber-bg",
  blue: "bg-chatcn-blue-bg",
  purple: "bg-chatcn-purple-bg",
  teal: "bg-chatcn-teal-bg",
}

/** Classes for a span: the kit hues, tuned for both themes. Bold is weight, dim steps back. */
function spanClass(style: AnsiStyle) {
  if (style.inverse) return cn("bg-chatcn-fg text-chatcn-bg", style.bold && "font-semibold")
  return cn(
    style.tone ? TONE[style.tone] : undefined,
    style.dim && !style.tone && "text-chatcn-fg-subtle",
    style.dim && style.tone && "opacity-75",
    style.bold && "font-semibold",
    style.italic && "italic",
    style.underline && "underline decoration-1 underline-offset-2",
    style.strike && "line-through",
    style.background ? BACKGROUND[style.background] : undefined,
  )
}

function Span({ span }: { span: AnsiSpan }) {
  const className = spanClass(span.style) || undefined
  if (span.style.href && /^https?:\/\//.test(span.style.href)) {
    return (
      <a
        href={span.style.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "chatcn-focus decoration-chatcn-border-strong hover:decoration-chatcn-fg underline underline-offset-2",
          className,
        )}
      >
        {span.text}
      </a>
    )
  }
  return className ? <span className={className}>{span.text}</span> : span.text
}

/** Finished lines are frozen, so memo skips them while new output streams in. */
const Line = React.memo(function Line({
  line,
  caret,
  activity,
}: {
  line: AnsiLine
  /** The live end of a running process: the kit's caret, solid while output flows. */
  caret?: boolean
  activity?: unknown
}) {
  return (
    <div data-slot="terminal-line" className="min-h-5">
      {line.map((span, i) => (
        <Span key={i} span={span} />
      ))}
      {caret ? <StreamingCaret activity={activity} className="ms-px" /> : null}
    </div>
  )
})

/** Parses `text` incrementally: only the appended part is read; anything else starts over. */
function useAnsiLines(text: string) {
  const ref = React.useRef<{ parser: AnsiParser; text: string; generation: number } | null>(null)
  return React.useMemo(() => {
    let state = ref.current
    const extendsPrev =
      state !== null &&
      text.length >= state.text.length &&
      text.slice(Math.max(0, state.text.length - 64), state.text.length) === state.text.slice(-64)
    if (!state || !extendsPrev) {
      state = { parser: new AnsiParser(), text: "", generation: (state?.generation ?? 0) + 1 }
      ref.current = state
    }
    state.parser.push(text.slice(state.text.length))
    state.text = text
    return { lines: state.parser.lines, parser: state.parser, generation: state.generation }
  }, [text])
}

function useElapsed(startedAt: number | undefined, active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active || startedAt === undefined) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active, startedAt])
  if (!active || startedAt === undefined) return undefined
  return Math.max(0, now - startedAt)
}

/** Measures the run itself when the caller passes no timing. */
function useAutoTiming(running: boolean) {
  const [startedAt, setStartedAt] = React.useState<number>()
  const [durationMs, setDurationMs] = React.useState<number>()
  React.useEffect(() => {
    if (running) {
      setStartedAt(Date.now())
      setDurationMs(undefined)
    }
  }, [running])
  React.useEffect(() => {
    if (!running && startedAt !== undefined && durationMs === undefined) {
      setDurationMs(Date.now() - startedAt)
    }
  }, [running, startedAt, durationMs])
  return { startedAt, durationMs }
}

function useToggle(prop: boolean | undefined, initial: boolean, onChange?: (v: boolean) => void) {
  const [state, setState] = React.useState(initial)
  const value = prop ?? state
  const set = (next: boolean) => {
    if (prop === undefined) setState(next)
    onChange?.(next)
  }
  return [value, set] as const
}

/* -------------------------------------------------------------------------------------------------
 * Header parts
 * -----------------------------------------------------------------------------------------------*/

function ExitBadge({ code }: { code: number }) {
  const failed = code !== 0
  return (
    <span
      data-slot="terminal-exit"
      className={cn(
        "rounded-chatcn-xs chatcn-text-12 inline-flex h-5 shrink-0 items-center gap-1 px-1.5 font-mono tabular-nums",
        // The label stays neutral for contrast; the icon and tint carry red or green.
        failed ? "bg-chatcn-red-bg text-chatcn-fg" : "bg-chatcn-green-bg text-chatcn-fg-muted",
      )}
    >
      {failed ? (
        <CircleXIcon aria-hidden="true" className="text-chatcn-red size-3" />
      ) : (
        <CircleCheckIcon aria-hidden="true" className="text-chatcn-green size-3" />
      )}
      {`exit ${code}`}
    </span>
  )
}

function HeaderToggle({
  label,
  hint,
  pressed,
  onPressedChange,
  disabled,
  children,
}: {
  label: string
  hint: string
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip content={hint}>
      <Button
        size="icon-xs"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => onPressedChange(!pressed)}
        className={cn(
          "pointer-coarse:size-11",
          pressed &&
            !disabled &&
            "bg-chatcn-fill-active text-chatcn-fg hover:bg-chatcn-fill-active",
        )}
      >
        {children}
      </Button>
    </Tooltip>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Input line
 * -----------------------------------------------------------------------------------------------*/

function TerminalInput({
  prompt,
  placeholder,
  onCommand,
  onClear,
  inputRef,
}: {
  prompt: React.ReactNode
  placeholder?: string
  onCommand: (command: string) => void
  onClear: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [value, setValue] = React.useState("")
  const history = React.useRef<string[]>([])
  const cursor = React.useRef(-1)
  const draft = React.useRef("")

  const recall = (index: number) => {
    const list = history.current
    cursor.current = index
    const next = index < 0 ? draft.current : (list[list.length - 1 - index] ?? "")
    setValue(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.setSelectionRange(next.length, next.length)
    })
  }

  return (
    <div data-slot="terminal-input" className="flex min-h-5 items-center gap-2">
      <span aria-hidden="true" className="text-chatcn-fg-subtle shrink-0 select-none">
        {prompt}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          cursor.current = -1
        }}
        onKeyDown={(event) => {
          // Never act while an IME is composing: Enter confirms the composition.
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === "Enter") {
            event.preventDefault()
            const command = value.trim()
            if (command) {
              history.current = [...history.current.filter((c) => c !== command), command]
            }
            cursor.current = -1
            draft.current = ""
            setValue("")
            onCommand(command)
          } else if (event.key === "ArrowUp") {
            if (history.current.length === 0) return
            event.preventDefault()
            if (cursor.current === -1) draft.current = value
            recall(Math.min(history.current.length - 1, cursor.current + 1))
          } else if (event.key === "ArrowDown") {
            if (cursor.current === -1) return
            event.preventDefault()
            recall(cursor.current - 1)
          } else if (event.ctrlKey && event.key === "c" && !window.getSelection()?.toString()) {
            event.preventDefault()
            setValue("")
            cursor.current = -1
          } else if (event.ctrlKey && event.key === "l") {
            event.preventDefault()
            onClear()
          }
        }}
        placeholder={placeholder}
        aria-label="Command"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className={cn(
          "text-chatcn-fg caret-chatcn-fg placeholder:text-chatcn-fg-faint min-w-0 flex-1 bg-transparent p-0 font-mono outline-none",
          "chatcn-text-12 pointer-coarse:chatcn-text-16 leading-5",
        )}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Terminal
 * -----------------------------------------------------------------------------------------------*/

function Terminal({
  text,
  command,
  title,
  cwd,
  running = false,
  exitCode,
  durationMs,
  startedAt,
  wrap: wrapProp,
  defaultWrap = false,
  onWrapChange,
  follow: followProp,
  defaultFollow = true,
  onFollowChange,
  onClear,
  onCommand,
  onInterrupt,
  prompt = "$",
  placeholder,
  height,
  maxHeight = 360,
  maxLines = 1000,
  hideHeader = false,
  actions,
  className,
  ...props
}: TerminalProps) {
  const { lines, parser, generation } = useAnsiLines(text)
  const [wrap, setWrap] = useToggle(wrapProp, defaultWrap, onWrapChange)
  const { scrollRef, contentRef, follow, setFollow, pin } = useChatcnTerminalFollow({
    follow: followProp,
    defaultFollow,
    onFollowChange,
  })

  // Local clear hides the lines on screen now. A fresh output stream shows everything again.
  const [cleared, setCleared] = React.useState({ generation: 0, at: 0 })
  const clearedAt = cleared.generation === generation ? cleared.at : 0
  const clear = () => {
    if (onClear) onClear()
    else setCleared({ generation, at: lines.length })
  }

  const [showAll, setShowAll] = React.useState(false)
  const visible = clearedAt > 0 ? lines.slice(clearedAt) : lines
  const hidden = showAll ? 0 : Math.max(0, visible.length - maxLines)
  const shown = hidden > 0 ? visible.slice(hidden) : visible

  const auto = useAutoTiming(running)
  const elapsed = useElapsed(startedAt ?? auto.startedAt, running)
  const duration = durationMs ?? auto.durationMs
  const finished = !running && exitCode !== undefined && exitCode !== null
  const failed = finished && exitCode !== 0
  const empty = visible.length === 0
  const interactive = onCommand !== undefined
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Lines that arrived since the user let go of the tail, counted on the way back pill.
  const releasedAt = React.useRef<number | null>(null)
  if (follow || !running) releasedAt.current = null
  else if (releasedAt.current === null) releasedAt.current = lines.length
  const unseen = releasedAt.current === null ? 0 : Math.max(0, lines.length - releasedAt.current)

  // A new output stream (a new command) follows again, even if the last one was scrolled up.
  const lastGeneration = React.useRef(generation)
  React.useEffect(() => {
    if (lastGeneration.current === generation) return
    lastGeneration.current = generation
    setFollow(true)
  }, [generation, setFollow])

  // Pin before paint so new lines never flash at the old scroll position.
  React.useLayoutEffect(() => {
    if (follow) pin()
  }, [follow, pin, lines.length, text, wrap])

  // The input line unmounts while a command runs. Give the caret back when it ends.
  const rootRef = React.useRef<HTMLDivElement>(null)
  const hadFocus = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!running && hadFocus.current) {
      hadFocus.current = false
      const active = document.activeElement
      if (!active || active === document.body || rootRef.current?.contains(active)) {
        inputRef.current?.focus({ preventScroll: true })
      }
    }
  }, [running])

  const label = command ? `Output of ${command}` : typeof title === "string" ? title : "Terminal"

  return (
    <div
      ref={rootRef}
      data-slot="terminal"
      data-terminal-state={running ? "running" : failed ? "failed" : finished ? "done" : "idle"}
      className={cn(
        "rounded-chatcn-lg bg-chatcn-inset shadow-chatcn-border text-chatcn-fg relative flex flex-col overflow-hidden",
        "forced-colors:outline-1 forced-colors:outline-solid",
        className,
      )}
      {...props}
    >
      {hideHeader ? null : (
        <div
          data-slot="terminal-header"
          className="border-chatcn-border/70 flex h-10 shrink-0 items-center gap-2.5 border-b ps-3 pe-1.5"
        >
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center [&_svg]:size-4",
              running ? "text-chatcn-fg" : failed ? "text-chatcn-red" : "text-chatcn-fg-subtle",
            )}
          >
            <span
              key={running ? "running" : failed ? "failed" : "idle"}
              className="grid place-items-center motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]"
            >
              {running ? (
                <Spinner />
              ) : failed ? (
                <CircleXIcon aria-hidden="true" />
              ) : (
                <SquareTerminalIcon aria-hidden="true" />
              )}
            </span>
          </span>

          <span className="chatcn-text-13 flex min-w-0 flex-1 items-baseline gap-2">
            {command ? (
              <span className="flex min-w-0 items-baseline gap-1.5 font-mono">
                <span aria-hidden="true" className="text-chatcn-fg-subtle select-none">
                  $
                </span>
                <span className="text-chatcn-fg truncate">{command}</span>
              </span>
            ) : (
              <span className="text-chatcn-fg truncate font-medium">{title ?? "Terminal"}</span>
            )}
            {cwd ? (
              <span className="chatcn-text-12 text-chatcn-fg-subtle hidden truncate font-mono sm:inline">
                {cwd}
              </span>
            ) : null}
          </span>

          <span className="chatcn-text-12 text-chatcn-fg-subtle flex shrink-0 items-center gap-2 tabular-nums">
            {running ? (
              <span>
                {elapsed !== undefined && elapsed >= 1000 ? formatDuration(elapsed) : "Running"}
              </span>
            ) : finished ? (
              <>
                {duration !== undefined ? <span>{formatDuration(duration)}</span> : null}
                <ExitBadge code={exitCode as number} />
              </>
            ) : null}
          </span>

          <span className="flex shrink-0 items-center gap-0.5">
            {actions}
            <HeaderToggle
              label="Wrap lines"
              hint={wrap ? "Scroll long lines" : "Wrap long lines"}
              pressed={wrap}
              onPressedChange={setWrap}
            >
              <WrapTextIcon />
            </HeaderToggle>
            <HeaderToggle
              label="Follow output"
              hint={follow ? "Stop following output" : "Follow output"}
              pressed={follow}
              onPressedChange={setFollow}
              // Nothing streams once the process ends, so the toggle rests instead of shouting.
              disabled={!running}
            >
              <ArrowDownIcon />
            </HeaderToggle>
            <Tooltip content="Clear" shortcut={interactive ? "Ctrl L" : undefined}>
              <Button
                size="icon-xs"
                aria-label="Clear output"
                disabled={empty}
                onClick={clear}
                className="pointer-coarse:size-11"
              >
                <BanIcon />
              </Button>
            </Tooltip>
            <CopyButton
              size="icon-xs"
              label="Copy output"
              value={() =>
                clearedAt > 0
                  ? visible.map((line) => line.map((s) => s.text).join("")).join("\n")
                  : parser.toPlainText()
              }
              disabled={empty}
              className="pointer-coarse:size-11"
            />
          </span>
        </div>
      )}

      <section
        ref={scrollRef}
        aria-label={label}
        // Scrollable output must be reachable by keyboard.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === "c" && running && onInterrupt) {
            if (window.getSelection()?.toString()) return
            event.preventDefault()
            onInterrupt()
          }
        }}
        onMouseUp={() => {
          // A click (not a text selection) on an interactive terminal puts the caret in the input.
          if (interactive && !running && !window.getSelection()?.toString()) {
            inputRef.current?.focus({ preventScroll: true })
          }
        }}
        style={{ height, maxHeight: height === undefined ? maxHeight : undefined }}
        className={cn(
          "chatcn-text-12 chatcn-scroll min-h-0 overflow-auto px-3 py-2.5 font-mono leading-5 [overflow-anchor:none]",
          "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
          wrap ? "[overflow-wrap:anywhere] whitespace-pre-wrap" : "whitespace-pre",
        )}
      >
        <div ref={contentRef} className={cn(!wrap && "w-max min-w-full")}>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => {
                setFollow(false)
                setShowAll(true)
              }}
              className={cn(
                "chatcn-focus rounded-chatcn-xs chatcn-text-12 text-chatcn-fg-muted mb-1 font-sans",
                "decoration-chatcn-border-strong hover:text-chatcn-fg underline underline-offset-2",
              )}
            >
              Show {hidden.toLocaleString()} earlier {hidden === 1 ? "line" : "lines"}
            </button>
          ) : null}
          {empty && !interactive ? (
            <div className="text-chatcn-fg-subtle min-h-5 font-sans">
              {running ? "Waiting for output…" : clearedAt > 0 ? "Cleared" : "No output"}
            </div>
          ) : (
            shown.map((line, i) => (
              <Line
                key={clearedAt + hidden + i}
                line={line}
                caret={running && i === shown.length - 1}
                activity={running && i === shown.length - 1 ? text.length : undefined}
              />
            ))
          )}
          {interactive && !running ? (
            <TerminalInput
              prompt={prompt}
              placeholder={placeholder}
              onCommand={(value) => {
                hadFocus.current = true
                setFollow(true)
                onCommand?.(value)
              }}
              onClear={clear}
              inputRef={inputRef}
            />
          ) : null}
        </div>
      </section>

      <button
        type="button"
        tabIndex={!follow && running ? 0 : -1}
        aria-hidden={follow || !running}
        aria-label={
          unseen > 0
            ? `Latest output, ${unseen.toLocaleString()} new ${unseen === 1 ? "line" : "lines"}`
            : undefined
        }
        onClick={() => setFollow(true)}
        className={cn(
          "chatcn-focus chatcn-press bg-chatcn-surface shadow-chatcn-md chatcn-text-12 text-chatcn-fg absolute end-3 bottom-3",
          "rounded-chatcn-sm inline-flex h-7 items-center gap-1.5 px-2.5 font-medium [&_svg]:size-3.5",
          "ease-chatcn-out transition-[opacity,translate] duration-150",
          !follow && running
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0 duration-100",
          "motion-reduce:translate-y-0",
        )}
      >
        <ArrowDownIcon />
        {unseen > 0 ? (
          <span className="tabular-nums">
            {unseen.toLocaleString()} new {unseen === 1 ? "line" : "lines"}
          </span>
        ) : (
          "Latest output"
        )}
      </button>

      {/* Announce the end, not every line. */}
      <span aria-live="polite" className="sr-only">
        {finished
          ? failed
            ? `Command failed with exit code ${exitCode}`
            : "Command finished"
          : ""}
      </span>
    </div>
  )
}

export type { TerminalProps }
export { Terminal }
