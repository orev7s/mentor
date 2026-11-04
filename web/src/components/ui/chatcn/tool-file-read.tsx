"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  isToolRunning,
  pickNumber,
  pickString,
  plural,
  type ToolBaseProps,
  ToolDetail,
  ToolPath,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { useChatcnHighlight } from "@/hooks/use-chatcn-highlight"
import {
  type ChatcnTokenLine,
  chatcnTokenClass,
  languageFromPath,
  languageLabel,
} from "@/lib/chatcn-highlighter"
import { ChevronDownIcon, FileTextIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * ToolCodePreview: code with a line number gutter, syntax highlighted. Shared by file read,
 * write and code exec.
 * -----------------------------------------------------------------------------------------------*/

interface ToolCodePreviewProps extends Omit<React.ComponentProps<"div">, "children"> {
  code: string
  /** Fence language, or an id resolved from the file name. Unknown ids stay plain. */
  language?: string
  /** Number of the first line. Defaults to 1. */
  startLine?: number
  /**
   * Lines shown before the rest folds behind "Show N more lines". Unlimited by default. A fold
   * never hides three lines or fewer: those just show.
   */
  maxLines?: number
  /** Line numbers to emphasize, for example the lines a search matched. */
  highlight?: number[]
  /** Optional label above the code, for example the language. */
  label?: React.ReactNode
  /** Show a copy action in the label row. On when a label is present. */
  copyable?: boolean
}

function CodeLines({
  lines,
  first,
  width,
  highlight,
}: {
  lines: ChatcnTokenLine[]
  first: number
  width: number
  highlight?: number[]
}) {
  return lines.map((tokens, i) => {
    const n = first + i
    const on = highlight?.includes(n)
    return (
      <span key={n} className={cn("grid grid-cols-[auto_1fr] pe-4", on && "bg-chatcn-alpha-300")}>
        <span
          aria-hidden="true"
          className={cn(
            "ps-3 pe-4 text-end tabular-nums select-none",
            on ? "text-chatcn-fg-muted" : "text-chatcn-fg-subtle",
          )}
          style={{ minWidth: `calc(${width}ch + 1.75rem)` }}
        >
          {n}
        </span>
        <span
          className={cn(
            "whitespace-pre",
            on ? "text-chatcn-fg" : "text-chatcn-fg-muted",
            tokens.length === 0 && "min-h-5",
          )}
        >
          {tokens.length === 0
            ? " "
            : tokens.map((token, index) => (
                <span key={index} className={chatcnTokenClass[token.role]}>
                  {token.content}
                </span>
              ))}
        </span>
      </span>
    )
  })
}

function ToolCodePreview({
  code,
  language,
  startLine = 1,
  maxLines,
  highlight,
  label,
  copyable,
  className,
  ...props
}: ToolCodePreviewProps) {
  const source = code.replace(/\n$/, "")
  const { lines: all } = useChatcnHighlight(source, language)
  const foldable = maxLines !== undefined && all.length > maxLines + 3
  const head = foldable ? all.slice(0, maxLines) : all
  const tail = foldable ? all.slice(maxLines) : []
  const width = String(startLine + all.length - 1).length

  // The folded lines mount on the first "Show more", then grow from 0fr to 1fr in the next frame,
  // so a long file costs nothing until someone asks for it and the height never jumps.
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const toggle = () => {
    if (open) return setOpen(false)
    if (mounted) return setOpen(true)
    setMounted(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
  }

  const showLabel = label !== undefined && label !== null
  const showCopy = copyable ?? showLabel

  return (
    <div
      data-slot="tool-code-preview"
      data-language={language}
      data-state={foldable ? (open ? "open" : "closed") : undefined}
      className={cn("rounded-chatcn-md bg-chatcn-inset min-w-0 overflow-hidden", className)}
      {...props}
    >
      {showLabel || showCopy ? (
        <div className="text-chatcn-fg-subtle flex h-8 items-center gap-2 ps-3 pe-1">
          <span className="chatcn-text-12 min-w-0 flex-1 truncate font-medium">{label}</span>
          {showCopy ? <CopyButton value={source} label="Copy code" /> : null}
        </div>
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled scroll region, not a form fieldset */}
      <div
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable regions must be reachable by keyboard
        tabIndex={0}
        role="group"
        aria-label="File contents"
        className={cn(
          "rounded-chatcn-md focus-visible:outline-chatcn-accent chatcn-scroll max-h-72 overflow-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2",
          showLabel || showCopy ? "pt-0 pb-0" : "pt-2",
          foldable ? "pb-0" : "pb-2",
        )}
      >
        <pre
          className={cn(
            "chatcn-text-12 relative w-max min-w-full font-mono leading-5",
            // The last three visible lines fade out: a measured hint that the file goes on. A mask,
            // so it works on any surface and never paints a gradient.
            foldable &&
              !open &&
              "[mask-image:linear-gradient(to_bottom,black_calc(100%-3.75rem),transparent)]",
          )}
        >
          <code className="grid">
            <CodeLines lines={head} first={startLine} width={width} highlight={highlight} />
            {mounted ? (
              <span
                data-slot="tool-code-preview-fold"
                className={cn(
                  "ease-chatcn-out grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <span className="grid min-h-0 overflow-hidden" inert={!open}>
                  <CodeLines
                    lines={tail}
                    first={startLine + head.length}
                    width={width}
                    highlight={highlight}
                  />
                </span>
              </span>
            ) : null}
          </code>
        </pre>
      </div>
      {foldable ? (
        <div className="flex px-1 py-1.5">
          <Button
            size="xs"
            aria-expanded={open}
            onClick={toggle}
            className="text-chatcn-fg-muted hover:text-chatcn-fg gap-1 tabular-nums"
          >
            {open
              ? "Show fewer lines"
              : `Show ${tail.length} more ${tail.length === 1 ? "line" : "lines"}`}
            <ChevronDownIcon
              className={cn(
                "ease-chatcn-out transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * ToolFileRead
 * -----------------------------------------------------------------------------------------------*/

interface ToolFileReadProps extends ToolBaseProps {
  path?: string
  /** File content that was read. */
  content?: string
  /** First line of the range read. Defaults to 1. */
  startLine?: number
  /** Last line of the range read, when the agent read part of a file. */
  endLine?: number
  /** Lines shown in the preview. Defaults to 40. */
  maxLines?: number
}

/** A file read: path and line range in the header, a numbered preview of what the agent saw. */
function ToolFileRead({
  name = "read_file",
  path,
  content,
  startLine = 1,
  endLine,
  maxLines = 40,
  ...props
}: ToolFileReadProps) {
  const running = isToolRunning(props.state, props.decision)
  const done = props.state === "output-available"
  const lineCount = content ? content.replace(/\n$/, "").split("\n").length : 0
  const last = endLine ?? (lineCount ? startLine + lineCount - 1 : undefined)
  const range =
    last !== undefined && (startLine > 1 || endLine !== undefined)
      ? `L${startLine}-${last}`
      : lineCount
        ? plural(lineCount, "line")
        : undefined

  const body =
    done && content !== undefined ? (
      content.length > 0 ? (
        <ToolCodePreview
          code={content}
          language={languageFromPath(path)}
          startLine={startLine}
          maxLines={maxLines}
          label={languageLabel(languageFromPath(path))}
        />
      ) : (
        <p className="chatcn-text-13 text-chatcn-fg-subtle">The file is empty.</p>
      )
    ) : undefined

  return (
    <ToolCall
      name={name}
      icon={<FileTextIcon />}
      title={running ? "Reading" : "Read"}
      detail={
        <ToolDetail meta={done ? range : undefined}>
          {path ? <ToolPath path={path} /> : undefined}
        </ToolDetail>
      }
      {...props}
    >
      {body}
    </ToolCall>
  )
}

function ToolFileReadPart(props: ToolRendererProps) {
  const { part } = props
  const output = part.output
  return (
    <ToolFileRead
      {...toolBasePropsFromPart(props)}
      path={pickString(part.input, "path", "file", "filePath", "file_path")}
      content={typeof output === "string" ? output : pickString(output, "content", "text")}
      startLine={pickNumber(part.input, "offset", "startLine", "start_line") ?? 1}
      endLine={pickNumber(part.input, "endLine", "end_line")}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolFileReadRenderers: ToolRendererMap = {
  read_file: ToolFileReadPart,
  read: ToolFileReadPart,
  view: ToolFileReadPart,
  cat: ToolFileReadPart,
}

export type { ToolCodePreviewProps, ToolFileReadProps }
export { ToolCodePreview, ToolFileRead, ToolFileReadPart, toolFileReadRenderers }
