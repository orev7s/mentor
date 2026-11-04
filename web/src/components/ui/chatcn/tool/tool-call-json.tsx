import * as React from "react"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * JSON view: monochrome, weight and gray only.
 * -----------------------------------------------------------------------------------------------*/

export function JsonValue({ value, depth }: { value: unknown; depth: number }): React.ReactNode {
  const pad = "  ".repeat(depth + 1)
  const close = "  ".repeat(depth)

  if (value === null) return <span className="text-chatcn-fg-subtle">null</span>
  if (typeof value === "string") {
    return <span className="text-chatcn-fg">{JSON.stringify(value)}</span>
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-chatcn-fg font-medium">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-chatcn-fg-subtle">[]</span>
    return (
      <>
        <span className="text-chatcn-fg-subtle">[</span>
        {"\n"}
        {value.map((item, i) => (
          <React.Fragment key={i}>
            {pad}
            <JsonValue value={item} depth={depth + 1} />
            {i < value.length - 1 ? <span className="text-chatcn-fg-subtle">,</span> : null}
            {"\n"}
          </React.Fragment>
        ))}
        {close}
        <span className="text-chatcn-fg-subtle">]</span>
      </>
    )
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-chatcn-fg-subtle">{"{}"}</span>
    return (
      <>
        <span className="text-chatcn-fg-subtle">{"{"}</span>
        {"\n"}
        {entries.map(([k, v], i) => (
          <React.Fragment key={k}>
            {pad}
            <span className="text-chatcn-fg-muted">{JSON.stringify(k)}</span>
            <span className="text-chatcn-fg-subtle">: </span>
            <JsonValue value={v} depth={depth + 1} />
            {i < entries.length - 1 ? <span className="text-chatcn-fg-subtle">,</span> : null}
            {"\n"}
          </React.Fragment>
        ))}
        {close}
        <span className="text-chatcn-fg-subtle">{"}"}</span>
      </>
    )
  }
  return <span className="text-chatcn-fg">{String(value)}</span>
}

export function ToolCallCode({
  children,
  streaming,
  className,
}: {
  children: React.ReactNode
  streaming?: boolean
  className?: string
}) {
  // Long input or output scrolls inside the box, so the box joins the tab order exactly when it
  // overflows: keyboard users can then scroll it, and short payloads add no extra tab stop.
  const ref = React.useRef<HTMLPreElement>(null)
  const [scrolls, setScrolls] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () =>
      setScrolls(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    <pre
      ref={ref}
      data-slot="tool-call-code"
      tabIndex={scrolls ? 0 : undefined}
      className={cn(
        "rounded-chatcn-md bg-chatcn-inset chatcn-scroll chatcn-focus max-h-72 overflow-auto px-3 py-2.5",
        "chatcn-text-12 text-chatcn-fg-muted font-mono [overflow-wrap:anywhere] whitespace-pre-wrap",
        className,
      )}
    >
      <code>
        {children}
        {streaming ? <StreamingCaret /> : null}
      </code>
    </pre>
  )
}

export function stringify(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallSection({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section data-slot="tool-call-section" className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center justify-between">
        <h4 className="chatcn-text-12 text-chatcn-fg-subtle font-medium">{label}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
