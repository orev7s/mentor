"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  asRecord,
  isToolRunning,
  pickNumber,
  pickString,
  plural,
  type ToolBaseProps,
  ToolDetail,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { RegexIcon, SearchIcon } from "@/lib/chatcn-icons"

interface CodeMatch {
  path: string
  line?: number
  text?: string
}

interface ToolSearchCodeProps extends ToolBaseProps {
  /** The pattern or glob searched for. */
  query?: string
  /** Treat `query` as a regular expression when highlighting. */
  regex?: boolean
  matches?: CodeMatch[]
  /** Files shown before "Show all". Defaults to 6. */
  initialFiles?: number
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matcher(query: string | undefined, regex: boolean) {
  if (!query) return undefined
  try {
    return new RegExp(regex ? query : escapeRegExp(query), "gi")
  } catch {
    return new RegExp(escapeRegExp(query), "gi")
  }
}

/** Wraps every match in a highlight: background and weight, so it reads in any theme. */
function Highlighted({ text, re }: { text: string; re?: RegExp }) {
  if (!re) return <>{text}</>
  const out: React.ReactNode[] = []
  let last = 0
  re.lastIndex = 0
  for (const m of text.matchAll(re)) {
    if (m[0] === "") break
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <mark
        key={at}
        className="bg-chatcn-fill-active text-chatcn-fg rounded-chatcn-xs -mx-px px-px font-medium"
      >
        {m[0]}
      </mark>,
    )
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/**
 * A code search (grep or glob): the pattern and the match count in the header, matches grouped by
 * file with `file:line` and the matched text highlighted.
 */
function ToolSearchCode({
  name = "grep",
  query,
  regex = false,
  matches = [],
  initialFiles = 6,
  ...props
}: ToolSearchCodeProps) {
  const [all, setAll] = React.useState(false)
  const running = isToolRunning(props.state, props.decision)
  const done = props.state === "output-available"
  const re = React.useMemo(() => matcher(query, regex), [query, regex])

  const files = React.useMemo(() => {
    const map = new Map<string, CodeMatch[]>()
    for (const m of matches) map.set(m.path, [...(map.get(m.path) ?? []), m])
    return [...map.entries()]
  }, [matches])
  const shown = all ? files : files.slice(0, initialFiles)

  const body = done ? (
    matches.length === 0 ? (
      <p className="chatcn-text-13 text-chatcn-fg-subtle">
        No matches. Check the pattern or widen the path.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        <ul data-slot="code-matches" className="flex flex-col gap-2.5">
          {shown.map(([path, list]) => (
            <li key={path} className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="chatcn-text-12 text-chatcn-fg truncate font-mono font-medium">
                  {path}
                </span>
                {list.some((m) => m.text !== undefined) ? (
                  <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
                    {list.length}
                  </span>
                ) : null}
              </div>
              {list.some((m) => m.text !== undefined) ? (
                // biome-ignore lint/a11y/useSemanticElements: a labelled scroll region, not a form fieldset
                <div
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: long matches scroll sideways, so the keyboard must reach them
                  tabIndex={0}
                  role="group"
                  aria-label={`Matches in ${path}`}
                  className="rounded-chatcn-md bg-chatcn-inset focus-visible:outline-chatcn-accent chatcn-scroll mt-1 overflow-x-auto py-1.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <pre className="chatcn-text-12 w-max min-w-full font-mono leading-5">
                    <code className="grid">
                      {list.map((m, i) => (
                        <span key={i} className="grid grid-cols-[3rem_1fr] pe-4">
                          <span className="text-chatcn-fg-subtle pe-3 text-end tabular-nums select-none">
                            {m.line ?? ""}
                          </span>
                          <span className="text-chatcn-fg-muted whitespace-pre">
                            <Highlighted text={(m.text ?? "").replace(/^\s+/, "")} re={re} />
                          </span>
                        </span>
                      ))}
                    </code>
                  </pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {files.length > initialFiles ? (
          <div>
            <Button size="xs" className="-ms-2" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${files.length} files`}
            </Button>
          </div>
        ) : null}
      </div>
    )
  ) : running ? (
    <p className="chatcn-text-13 text-chatcn-fg-subtle">Searching the workspace…</p>
  ) : undefined

  const filesLabel = plural(files.length, "file")
  return (
    <ToolCall
      name={name}
      icon={regex ? <RegexIcon /> : <SearchIcon />}
      title={running ? "Searching" : "Searched"}
      detail={
        <ToolDetail
          meta={
            done
              ? matches.some((m) => m.text !== undefined)
                ? `${plural(matches.length, "match", "matches")} in ${filesLabel}`
                : filesLabel
              : undefined
          }
        >
          {query}
        </ToolDetail>
      }
      {...props}
    >
      {body}
    </ToolCall>
  )
}

/** Normalizes grep and glob outputs: `{ matches }`, `{ files }`, `[...]` or ripgrep-style text. */
function codeMatchesFrom(output: unknown): CodeMatch[] {
  if (typeof output === "string") {
    return output
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const m = /^(.+?):(\d+):(.*)$/.exec(row)
        return m ? { path: m[1] as string, line: Number(m[2]), text: m[3] } : { path: row }
      })
  }
  const record = asRecord(output)
  const list = Array.isArray(output) ? output : (record.matches ?? record.results ?? record.files)
  if (!Array.isArray(list)) return []
  return list.flatMap((item): CodeMatch[] => {
    if (typeof item === "string") return [{ path: item }]
    const path = pickString(item, "path", "file", "filePath")
    if (!path) return []
    return [
      {
        path,
        line: pickNumber(item, "line", "lineNumber", "line_number"),
        text: pickString(item, "text", "content", "match", "preview"),
      },
    ]
  })
}

function ToolSearchCodePart(props: ToolRendererProps) {
  const { part } = props
  const name = toolBasePropsFromPart(props).name ?? ""
  return (
    <ToolSearchCode
      {...toolBasePropsFromPart(props)}
      query={pickString(part.input, "pattern", "query", "glob", "regex")}
      regex={/grep|regex/i.test(name) || pickString(part.input, "regex") !== undefined}
      matches={codeMatchesFrom(part.output)}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolSearchCodeRenderers: ToolRendererMap = {
  grep: ToolSearchCodePart,
  glob: ToolSearchCodePart,
  search_code: ToolSearchCodePart,
  codebase_search: ToolSearchCodePart,
  find_files: ToolSearchCodePart,
}

export type { CodeMatch, ToolSearchCodeProps }
export { codeMatchesFrom, ToolSearchCode, ToolSearchCodePart, toolSearchCodeRenderers }
