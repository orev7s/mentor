"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { getSourceDomain, type Source, SourceTile } from "@/components/ui/chatcn/sources"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  asRecord,
  isToolRunning,
  pickString,
  plural,
  type ToolBaseProps,
  ToolDetail,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { WebSearchIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

interface ToolWebSearchProps extends Omit<ToolBaseProps, "results"> {
  query?: string
  results?: Source[]
  /** Results shown before "Show all". Defaults to 5. */
  initialCount?: number
}

/**
 * A web search: the query in the header with the result count, results as a quiet list with a
 * letter tile, title, domain and snippet. Long lists fold behind "Show all".
 */
function ToolWebSearch({
  name = "web_search",
  query,
  results = [],
  initialCount = 5,
  ...props
}: ToolWebSearchProps) {
  const [all, setAll] = React.useState(false)
  const running = isToolRunning(props.state, props.decision)
  const done = props.state === "output-available"
  const shown = all ? results : results.slice(0, initialCount)

  const body =
    done && results.length > 0 ? (
      <div className="flex flex-col">
        <ul data-slot="web-search-results" className="-mx-1.5 flex flex-col">
          {shown.map((result) => (
            <li key={result.id ?? result.url} className="min-w-0">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "chatcn-focus rounded-chatcn-md flex min-w-0 gap-2.5 px-1.5 py-1.5",
                  "hover:bg-chatcn-fill-hover ease-chatcn-standard transition-colors duration-150",
                )}
              >
                <SourceTile source={result} className="mt-px size-4" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="chatcn-text-13 text-chatcn-fg truncate font-medium">
                      {result.title ?? result.url}
                    </span>
                    <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0">
                      {result.domain ?? getSourceDomain(result.url)}
                    </span>
                  </span>
                  {result.snippet ? (
                    <span className="chatcn-text-12 text-chatcn-fg-muted line-clamp-2 text-pretty">
                      {result.snippet}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {results.length > initialCount ? (
          <div className="pt-1">
            <Button size="xs" className="-ms-2" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${results.length}`}
            </Button>
          </div>
        ) : null}
      </div>
    ) : done ? (
      <p className="chatcn-text-13 text-chatcn-fg-subtle">No results. Try a broader query.</p>
    ) : running ? (
      <p className="chatcn-text-13 text-chatcn-fg-subtle">Waiting for results…</p>
    ) : undefined

  return (
    <ToolCall
      name={name}
      icon={<WebSearchIcon />}
      title={running ? "Searching the web" : "Searched the web"}
      detail={
        <ToolDetail meta={done ? plural(results.length, "result") : undefined}>{query}</ToolDetail>
      }
      {...props}
    >
      {body}
    </ToolCall>
  )
}

/** Normalizes common search outputs: `{ results: [...] }`, `[...]`, with `url` or `link`. */
function webSearchResultsFrom(output: unknown): Source[] {
  const list = Array.isArray(output) ? output : asRecord(output).results
  if (!Array.isArray(list)) return []
  return list.flatMap((item) => {
    const url = pickString(item, "url", "link", "href")
    if (!url) return []
    return [
      {
        url,
        title: pickString(item, "title", "name"),
        snippet: pickString(item, "snippet", "description", "content", "text"),
        favicon: pickString(item, "favicon", "icon"),
      },
    ]
  })
}

function ToolWebSearchPart(props: ToolRendererProps) {
  const { part } = props
  return (
    <ToolWebSearch
      {...toolBasePropsFromPart(props)}
      query={pickString(part.input, "query", "q", "search")}
      results={webSearchResultsFrom(part.output)}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolWebSearchRenderers: ToolRendererMap = {
  web_search: ToolWebSearchPart,
  search_web: ToolWebSearchPart,
  google_search: ToolWebSearchPart,
  brave_search: ToolWebSearchPart,
}

export type { ToolWebSearchProps }
export { ToolWebSearch, ToolWebSearchPart, toolWebSearchRenderers, webSearchResultsFrom }
