import { getSourceDomain, SourceTile } from "@/components/ui/chatcn/sources"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  isToolRunning,
  pickNumber,
  pickString,
  type ToolBaseProps,
  ToolDetail,
  ToolPath,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { GlobeIcon } from "@/lib/chatcn-icons"

interface ToolWebFetchProps extends ToolBaseProps {
  url?: string
  /** Page title from the fetched document. */
  pageTitle?: string
  /** The opening of the page text, or the part the agent used. */
  excerpt?: string
  /** HTTP status, shown when it is not 200. */
  status?: number
}

function pathOf(url: string) {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`
  } catch {
    return url
  }
}

/**
 * A page fetch: "Read nextjs.org/docs/..." in the header, then the page title, its address and an
 * excerpt of what the agent read.
 */
function ToolWebFetch({
  name = "web_fetch",
  url,
  pageTitle,
  excerpt,
  status,
  ...props
}: ToolWebFetchProps) {
  const running = isToolRunning(props.state, props.decision)
  const done = props.state === "output-available"
  const failedStatus = status !== undefined && (status < 200 || status >= 300)

  const body =
    done && url ? (
      <div className="flex min-w-0 flex-col gap-1.5">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="chatcn-focus rounded-chatcn-xs group/fetch flex min-w-0 items-center gap-2"
        >
          <SourceTile source={{ url }} className="size-4" />
          <span className="chatcn-text-13 text-chatcn-fg truncate font-medium underline-offset-2 group-hover/fetch:underline">
            {pageTitle ?? getSourceDomain(url)}
          </span>
        </a>
        <p className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">{url}</p>
        {excerpt ? (
          // A filled excerpt, like every other tool body: no second rule beside the row's guide line.
          <blockquote className="rounded-chatcn-md bg-chatcn-inset chatcn-text-13 text-chatcn-fg-muted mt-1 px-3 py-2.5">
            <p className="line-clamp-6 text-pretty">{excerpt}</p>
          </blockquote>
        ) : null}
      </div>
    ) : running ? (
      <p className="chatcn-text-13 text-chatcn-fg-subtle">Loading the page…</p>
    ) : undefined

  return (
    <ToolCall
      name={name}
      icon={<GlobeIcon />}
      title={running ? "Reading" : "Read"}
      detail={
        <ToolDetail meta={failedStatus ? `HTTP ${status}` : undefined}>
          {url ? <ToolPath path={pathOf(url)} /> : undefined}
        </ToolDetail>
      }
      {...props}
    >
      {body}
    </ToolCall>
  )
}

function ToolWebFetchPart(props: ToolRendererProps) {
  const { part } = props
  const output = part.output
  return (
    <ToolWebFetch
      {...toolBasePropsFromPart(props)}
      url={pickString(part.input, "url", "href") ?? pickString(output, "url")}
      pageTitle={pickString(output, "title")}
      excerpt={
        typeof output === "string"
          ? output
          : pickString(output, "excerpt", "content", "text", "markdown")
      }
      status={pickNumber(output, "status", "statusCode")}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolWebFetchRenderers: ToolRendererMap = {
  web_fetch: ToolWebFetchPart,
  fetch_url: ToolWebFetchPart,
  fetch: ToolWebFetchPart,
  browse: ToolWebFetchPart,
}

export type { ToolWebFetchProps }
export { ToolWebFetch, ToolWebFetchPart, toolWebFetchRenderers }
